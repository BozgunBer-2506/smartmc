import { HttpStatus, Injectable } from "@nestjs/common";
import { defaultConnectorRegistry, type Connector } from "@smc/connector-sdk";
import { getPrismaClient, newId, type Message } from "@smc/database";
import { AuditLogService } from "../audit/audit-log.service";
import { httpError } from "../common/http-error";
import { CredentialsStoreService } from "../credentials-store/credentials-store.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { SchedulerService } from "../automation/scheduler.service";

export interface SendMessageParams {
  workspaceId: string;
  conversationId: string;
  bodyText: string;
  actorUserId: string | null;
  actorType: "user" | "system";
}

/**
 * The actual outbound-send logic shared by the synchronous reply path
 * (ConversationsController.sendMessage) and a fired scheduled message
 * (ScheduledMessageService) - extracted so a scheduled send goes through
 * the exact same connector/credential/persist/realtime/audit steps as a
 * live reply, not a re-implementation that could drift from it.
 */
@Injectable()
export class MessageSendService {
  constructor(
    private readonly realtime: RealtimeGateway,
    private readonly credentialsStore: CredentialsStoreService,
    private readonly auditLogService: AuditLogService,
    private readonly scheduler: SchedulerService,
  ) {}

  async send(params: SendMessageParams): Promise<Message> {
    const prisma = getPrismaClient();
    const conversation = await prisma.conversation.findFirst({
      where: { id: params.conversationId, workspaceId: params.workspaceId },
      include: { linkedAccount: true, provider: true },
    });
    if (!conversation) {
      throw httpError(HttpStatus.NOT_FOUND, "CONVERSATION_NOT_FOUND", "Conversation not found.");
    }
    if (!conversation.linkedAccount) {
      throw httpError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "LINKED_ACCOUNT_NOT_AVAILABLE",
        "This conversation has no connected account to send through.",
      );
    }
    if (conversation.linkedAccount.deletedAt || conversation.linkedAccount.status === "reauth_required") {
      throw httpError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "LINKED_ACCOUNT_REAUTH_REQUIRED",
        "The connected account needs to be reauthorized before sending.",
      );
    }

    const connector = defaultConnectorRegistry.get(conversation.provider.key) as Connector;
    if (!connector.send) {
      throw httpError(
        HttpStatus.NOT_IMPLEMENTED,
        "SEND_NOT_SUPPORTED",
        `Sending is not yet supported for provider "${conversation.provider.key}".`,
      );
    }

    const token = await this.credentialsStore.getSecret(conversation.linkedAccount.credentialsRef);
    let sendResult;
    try {
      sendResult = await connector.send(
        { conversationExternalId: conversation.externalId, bodyText: params.bodyText },
        { credential: token, linkedAccountId: conversation.linkedAccount.id },
      );
    } catch (err) {
      throw httpError(HttpStatus.BAD_GATEWAY, "SEND_FAILED", err instanceof Error ? err.message : "Failed to send message.");
    }

    const message = await prisma.message.create({
      data: {
        id: newId(),
        workspaceId: params.workspaceId,
        conversationId: conversation.id,
        externalId: sendResult.externalId,
        senderContactId: null,
        direction: "outbound",
        bodyText: params.bodyText,
        receivedAt: new Date(),
      },
    });

    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.receivedAt } });

    this.realtime.emitToWorkspace(params.workspaceId, "message.sent", {
      id: message.id,
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
    });

    await this.auditLogService.log({
      workspaceId: params.workspaceId,
      actorUserId: params.actorUserId,
      actorType: params.actorType,
      action: "message.sent",
      resourceType: "message",
      resourceId: message.id,
      metadata: { conversationId: conversation.id, providerKey: conversation.provider.key },
    });

    // A reply (live or scheduled) is exactly the event a `time.no_reply_after`
    // rule was waiting to not happen - cancel any pending job for this
    // conversation (docs/AUTOMATION_ENGINE.md Section 3.3).
    await this.scheduler.cancelNoReplyRules(params.workspaceId, conversation.id);

    return message;
  }
}
