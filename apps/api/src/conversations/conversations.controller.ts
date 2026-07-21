import { Body, Controller, Get, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { defaultConnectorRegistry, type Connector } from "@smc/connector-sdk";
import { getPrismaClient, newId } from "@smc/database";
import { AuditLogService } from "../audit/audit-log.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";
import { CredentialsStoreService } from "../credentials-store/credentials-store.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

/**
 * The inbox read path (docs/ROADMAP.md Phase 3, docs/API.md Section 10.3).
 * Implemented as REST, not GraphQL - ADR-0015 records why: API.md frames
 * the inbox read path as "primarily GraphQL" (ADR-0003), but no GraphQL
 * server exists yet, and standing one up now would be new infrastructure
 * this phase's scope explicitly rules out. This is a scoped, documented
 * deviation, not a silent one.
 */
interface SendMessageDto {
  body?: string;
}

@Controller("conversations")
export class ConversationsController {
  constructor(
    private readonly realtime: RealtimeGateway,
    private readonly credentialsStore: CredentialsStoreService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();

    const conversations = await prisma.conversation.findMany({
      where: { workspaceId: claims.workspaceId },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      include: {
        provider: true,
        messages: {
          orderBy: { receivedAt: "desc" },
          take: 1,
          include: { sender: true },
        },
      },
    });

    return conversations.map((conversation) => {
      const lastMessage = conversation.messages[0];
      return {
        id: conversation.id,
        title: conversation.title,
        providerKey: conversation.provider.key,
        lastMessageAt: conversation.lastMessageAt,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              bodyText: lastMessage.bodyText,
              direction: lastMessage.direction,
              receivedAt: lastMessage.receivedAt,
              sender: lastMessage.sender
                ? {
                    id: lastMessage.sender.id,
                    displayName: lastMessage.sender.displayName,
                    isVip: lastMessage.sender.isVip,
                  }
                : null,
            }
          : null,
      };
    });
  }

  @Get(":id/messages")
  @UseGuards(JwtAuthGuard)
  async messages(@Param("id") id: string, @CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();

    // Workspace-ownership check before returning any message - a
    // conversation belonging to a different workspace is reported as
    // 404, never 403 (SECURITY.md's existence-sensitivity policy: a
    // multi-tenant resource's existence is itself sensitive information).
    const conversation = await prisma.conversation.findFirst({
      where: { id, workspaceId: claims.workspaceId },
    });

    if (!conversation) {
      throw httpError(HttpStatus.NOT_FOUND, "CONVERSATION_NOT_FOUND", "Conversation not found.");
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { receivedAt: "asc" },
      include: { sender: true },
    });

    return messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
      sender: message.sender
        ? { id: message.sender.id, displayName: message.sender.displayName, isVip: message.sender.isVip }
        : null,
    }));
  }

  /**
   * The reply path (docs/ROADMAP.md Phase 4 Sprint 2, docs/API.md Section
   * 10.3's `POST /v1/conversations/{id}/messages`). Disclosed simplification
   * vs. API.md's documented `202 Accepted` + async-delivery-over-WebSocket
   * shape: this sends synchronously and returns `201` once Telegram has
   * actually accepted the message, since Sprint 2 has no outbound event
   * processor yet - see docs/reviews/phase-4-sprint-2-review.md.
   */
  @Post(":id/messages")
  @UseGuards(JwtAuthGuard)
  async sendMessage(@Param("id") id: string, @Body() dto: SendMessageDto, @CurrentUser() claims: JwtPayload) {
    if (!dto.body || typeof dto.body !== "string" || dto.body.trim().length === 0) {
      throw httpError(HttpStatus.BAD_REQUEST, "BODY_REQUIRED", "A message body is required.");
    }

    const prisma = getPrismaClient();
    const conversation = await prisma.conversation.findFirst({
      where: { id, workspaceId: claims.workspaceId },
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
        { conversationExternalId: conversation.externalId, bodyText: dto.body },
        { credential: token, linkedAccountId: conversation.linkedAccount.id },
      );
    } catch (err) {
      throw httpError(HttpStatus.BAD_GATEWAY, "SEND_FAILED", err instanceof Error ? err.message : "Failed to send message.");
    }

    const message = await prisma.message.create({
      data: {
        id: newId(),
        workspaceId: claims.workspaceId,
        conversationId: conversation.id,
        externalId: sendResult.externalId,
        senderContactId: null,
        direction: "outbound",
        bodyText: dto.body,
        receivedAt: new Date(),
      },
    });

    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.receivedAt } });

    this.realtime.emitToWorkspace(claims.workspaceId, "message.sent", {
      id: message.id,
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
    });

    await this.auditLogService.log({
      workspaceId: claims.workspaceId,
      actorUserId: claims.sub,
      actorType: "user",
      action: "message.sent",
      resourceType: "message",
      resourceId: message.id,
      metadata: { conversationId: conversation.id, providerKey: conversation.provider.key },
    });

    return {
      id: message.id,
      direction: message.direction,
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
    };
  }
}
