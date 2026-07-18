import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { getPrismaClient, newId, type Contact, type Message } from "@smc/database";
import { resolveIdentity } from "@smc/identity";
import { createEvent, EventType, type EventEnvelope } from "@smc/event-model";
import { DEV_ORGANIZATION_ID, DEV_WORKSPACE_ID, type InboundMessagePayload } from "@smc/shared";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { EVENTS_QUEUE_NAME } from "./events.service";
import { redisConnection } from "./redis-connection";

/**
 * Consumes the event bus (docs/ARCHITECTURE.md Section 4 / ADR-0005) and
 * drives Phase 1's full vertical slice (docs/ROADMAP.md Phase 1 Sprint 2):
 *
 *   Mock Connector -> message.received -> IdentityGraph (exact-match) ->
 *   Database -> WebSocket -> Inbox UI -> stub rule -> stub notification
 *
 * The "rule" and "notification" steps here are deliberately minimal stubs
 * (docs/ROADMAP.md Phase 1 Sprint 2), not the real Automation Engine
 * (docs/AUTOMATION_ENGINE.md, Phase 10) or Notification Service (Phase 11) -
 * this class proves the pipeline's shape, not its final sophistication.
 */
@Injectable()
export class EventsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsProcessor.name);
  private worker?: Worker;

  constructor(private readonly realtime: RealtimeGateway) {}

  onModuleInit(): void {
    this.worker = new Worker(
      EVENTS_QUEUE_NAME,
      async (job: Job<EventEnvelope<unknown>>) => this.handle(job.data),
      { connection: redisConnection },
    );

    this.worker.on("failed", (job, err) => {
      this.logger.error(`Job ${job?.id ?? "unknown"} failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async handle(event: EventEnvelope<unknown>): Promise<void> {
    this.logger.log(`Handling ${event.type} (${event.eventId})`);

    switch (event.type) {
      case EventType.MESSAGE_RECEIVED:
        await this.handleMessageReceived(event as EventEnvelope<InboundMessagePayload>);
        return;
      default:
        this.logger.warn(`No handler registered for event type "${event.type}"`);
    }
  }

  private async handleMessageReceived(
    event: EventEnvelope<InboundMessagePayload>,
  ): Promise<void> {
    const prisma = getPrismaClient();
    const payload = event.payload;

    // Dev-mode convenience, scoped narrowly (Phase 3): only the fixed
    // DEV_WORKSPACE_ID fixture gets auto-provisioned here. A real,
    // authenticated user's workspace is created once, transactionally, by
    // AuthService.register() (Phase 2) - it must already exist by the
    // time a message for it arrives. If it doesn't, the Message/Contact
    // writes below fail with a clear FK error rather than this processor
    // silently manufacturing a workspace (and, worse, a fabricated
    // Organization) as a side effect of unrelated message traffic.
    if (payload.workspaceId === DEV_WORKSPACE_ID) {
      await prisma.organization.upsert({
        where: { id: DEV_ORGANIZATION_ID },
        update: {},
        create: { id: DEV_ORGANIZATION_ID, name: "Dev Organization", slug: "dev-organization" },
      });

      await prisma.workspace.upsert({
        where: { id: payload.workspaceId },
        update: {},
        create: {
          id: payload.workspaceId,
          organizationId: DEV_ORGANIZATION_ID,
          name: "Dev Workspace",
          timezone: "UTC",
        },
      });
    }

    const provider = await prisma.provider.upsert({
      where: { key: payload.providerKey },
      update: {},
      create: { id: newId(), key: payload.providerKey, displayName: payload.providerKey },
    });

    // IdentityGraph exact-match resolution (docs/ARCHITECTURE.md Section 13,
    // docs/ROADMAP.md Phase 3 scope) - the platform reasons about this
    // Contact from this point forward, never the raw providerKey/senderExternalId again.
    const contact = await resolveIdentity({
      workspaceId: payload.workspaceId,
      providerId: provider.id,
      externalId: payload.senderExternalId,
      handle: payload.senderHandle,
      displayName: payload.senderDisplayName,
    });

    const conversation = await prisma.conversation.upsert({
      where: {
        uq_conversations_provider_external: {
          providerId: provider.id,
          externalId: payload.conversationExternalId,
          workspaceId: payload.workspaceId,
        },
      },
      update: { lastMessageAt: new Date(payload.receivedAt) },
      create: {
        id: newId(),
        workspaceId: payload.workspaceId,
        providerId: provider.id,
        externalId: payload.conversationExternalId,
        title: payload.conversationTitle ?? null,
        lastMessageAt: new Date(payload.receivedAt),
      },
    });

    const message = await prisma.message.create({
      data: {
        id: newId(),
        workspaceId: payload.workspaceId,
        conversationId: conversation.id,
        externalId: payload.messageExternalId,
        senderContactId: contact.id,
        direction: "inbound",
        bodyText: payload.bodyText,
        receivedAt: new Date(payload.receivedAt),
      },
    });

    this.realtime.emitToWorkspace(payload.workspaceId, "message.received", {
      id: message.id,
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sender: { id: contact.id, displayName: contact.displayName, isVip: contact.isVip },
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
    });

    await this.runStubRule(event, message, contact, payload.workspaceId);
  }

  private async runStubRule(
    triggeringEvent: EventEnvelope<unknown>,
    message: Message,
    contact: Contact,
    workspaceId: string,
  ): Promise<void> {
    const prisma = getPrismaClient();

    const triggeredEvent = createEvent({
      type: EventType.RULE_TRIGGERED,
      producer: "stub-rule-engine",
      workspaceId,
      payload: { ruleId: "stub-rule-notify-on-message", messageId: message.id },
      causedBy: triggeringEvent,
    });
    this.logger.log(`${triggeredEvent.type} (${triggeredEvent.eventId})`);

    const notification = await prisma.notification.create({
      data: {
        id: newId(),
        workspaceId,
        messageId: message.id,
        type: "message",
        title: `New message from ${contact.displayName}`,
        body: message.bodyText,
      },
    });

    const actionExecutedEvent = createEvent({
      type: EventType.RULE_ACTION_EXECUTED,
      producer: "stub-rule-engine",
      workspaceId,
      payload: { ruleId: "stub-rule-notify-on-message", notificationId: notification.id },
      causedBy: triggeredEvent,
    });
    this.logger.log(`${actionExecutedEvent.type} (${actionExecutedEvent.eventId})`);

    const notificationCreatedEvent = createEvent({
      type: EventType.NOTIFICATION_CREATED,
      producer: "stub-rule-engine",
      workspaceId,
      payload: { notificationId: notification.id },
      causedBy: actionExecutedEvent,
    });
    this.logger.log(`${notificationCreatedEvent.type} (${notificationCreatedEvent.eventId})`);

    this.realtime.emitToWorkspace(workspaceId, "notification.created", {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      createdAt: notification.createdAt,
    });
  }
}
