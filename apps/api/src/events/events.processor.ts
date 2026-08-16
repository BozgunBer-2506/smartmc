import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { getPrismaClient, newId, type Contact, type Conversation, type Message } from "@smc/database";
import { resolveIdentity } from "@smc/identity";
import { createEvent, EventType, type EventEnvelope } from "@smc/event-model";
import { computePriorityScore, DEV_ORGANIZATION_ID, DEV_WORKSPACE_ID, type InboundMessagePayload } from "@smc/shared";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { RuleExecutionService } from "../automation/rule-execution.service";
import { SchedulerService } from "../automation/scheduler.service";
import { MetricsService } from "../observability/metrics.service";
import { EVENTS_QUEUE_NAME } from "./events.service";
import { redisConnection } from "./redis-connection";

/**
 * Consumes the event bus (docs/ARCHITECTURE.md Section 4 / ADR-0005) and
 * drives the full pipeline (docs/ROADMAP.md Phase 1 Sprint 2, extended by
 * Phase 10):
 *
 *   Connector -> message.received -> IdentityGraph (exact-match) ->
 *   Database -> WebSocket -> Inbox UI -> Automation Engine -> notifications/
 *   tags/replies/webhooks per matched rules
 *
 * The rule-matching/execution step was a hardcoded stub through Phase 9
 * (docs/ROADMAP.md Phase 1 Sprint 2) - Phase 10 replaces it with the real
 * Automation Engine (docs/AUTOMATION_ENGINE.md, RuleExecutionService).
 */
@Injectable()
export class EventsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsProcessor.name);
  private worker?: Worker;

  constructor(
    private readonly realtime: RealtimeGateway,
    private readonly ruleExecution: RuleExecutionService,
    private readonly scheduler: SchedulerService,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      EVENTS_QUEUE_NAME,
      async (job: Job<EventEnvelope<unknown>>) => this.handle(job.data),
      { connection: redisConnection },
    );

    this.worker.on("completed", () => this.metrics.bullmqJobsProcessedTotal.inc({ queue: EVENTS_QUEUE_NAME }));
    this.worker.on("failed", (job, err) => {
      this.metrics.bullmqJobsFailedTotal.inc({ queue: EVENTS_QUEUE_NAME });
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
      // Re-links the conversation to whichever LinkedAccount just delivered
      // this message. Without this, a conversation that outlives a
      // disconnect/reconnect cycle keeps pointing at the old, soft-deleted
      // LinkedAccount forever (its `linkedAccountId` was previously only
      // ever set at `create` time) - outbound send (MessageSendService)
      // then permanently 422s with LINKED_ACCOUNT_REAUTH_REQUIRED even
      // after a successful reconnect, since a new connect always creates a
      // new LinkedAccount row (Phase 21.1) rather than reviving the old
      // one. Found via a real production scheduled-send failure (Phase
      // 21.6) that traced back to exactly this. `?? undefined` so a
      // payload that genuinely doesn't carry one (Mock Connector) never
      // nulls out an existing link.
      update: { lastMessageAt: new Date(payload.receivedAt), linkedAccountId: payload.linkedAccountId ?? undefined },
      create: {
        id: newId(),
        workspaceId: payload.workspaceId,
        providerId: provider.id,
        linkedAccountId: payload.linkedAccountId ?? null,
        externalId: payload.conversationExternalId,
        title: payload.conversationTitle ?? null,
        lastMessageAt: new Date(payload.receivedAt),
      },
    });

    // Idempotent duplicate handling (docs/CONNECTOR_SDK.md Section 10): the
    // same message can legitimately arrive twice - a Telegram webhook
    // retried after a slow response, a reconciliation pass recovering a
    // message the webhook already delivered, or a BullMQ job retried after
    // a crash mid-processing. The (conversationId, externalId) unique
    // constraint is the dedup key; a duplicate is a safe no-op, not an
    // error and not a second notification.
    const existingMessage = await prisma.message.findUnique({
      where: {
        uq_messages_conversation_external: {
          conversationId: conversation.id,
          externalId: payload.messageExternalId,
        },
      },
    });
    if (existingMessage) {
      this.logger.log(`Duplicate message ignored (already ingested as ${existingMessage.id})`);
      return;
    }

    // Unified priority scoring (docs/PRODUCT.md, Phase 9) - a rule-based,
    // fully explainable signal (VIP sender + urgency-keyword match) computed
    // once at ingestion time, not recomputed on every read.
    const priorityScore = computePriorityScore({ isVip: contact.isVip, bodyText: payload.bodyText });

    const message = await prisma.message.create({
      data: {
        id: newId(),
        workspaceId: payload.workspaceId,
        conversationId: conversation.id,
        externalId: payload.messageExternalId,
        senderContactId: contact.id,
        direction: payload.direction,
        bodyText: payload.bodyText,
        receivedAt: new Date(payload.receivedAt),
      },
    });

    // The conversation's own priorityScore reflects its highest-scored
    // message, so a single urgent/VIP message keeps a thread surfaced even
    // after quieter follow-ups arrive.
    if (priorityScore > conversation.priorityScore) {
      await prisma.conversation.update({ where: { id: conversation.id }, data: { priorityScore } });
    }

    // docs/ROADMAP.md Phase 20.5 - counted here, not on every event bus
    // publish: this is the point a message is durably ingested, past the
    // duplicate-detection early return above.
    this.metrics.connectorMessagesReceivedTotal.inc({ provider: payload.providerKey });

    this.realtime.emitToWorkspace(payload.workspaceId, "message.received", {
      id: message.id,
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      sender: { id: contact.id, displayName: contact.displayName, isVip: contact.isVip },
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
      priorityScore,
    });

    await this.runAutomationEngine(event, message, contact, conversation, payload.providerKey, payload.workspaceId);

    // A reply arriving on this conversation cancels any pending
    // `time.no_reply_after` jobs (the condition that would fire them no
    // longer holds); an inbound message (re)starts the clock for every
    // such rule (docs/AUTOMATION_ENGINE.md Section 3.3).
    if (payload.direction === "inbound") {
      await this.scheduler.scheduleNoReplyRules(payload.workspaceId, conversation.id);
    } else {
      await this.scheduler.cancelNoReplyRules(payload.workspaceId, conversation.id);
    }
  }

  private async runAutomationEngine(
    triggeringEvent: EventEnvelope<unknown>,
    message: Message,
    contact: Contact,
    conversation: Conversation,
    providerKey: string,
    workspaceId: string,
  ): Promise<void> {
    const triggeredEvent = createEvent({
      type: EventType.RULE_TRIGGERED,
      producer: "automation-engine",
      workspaceId,
      payload: { messageId: message.id },
      causedBy: triggeringEvent,
    });
    this.logger.log(`${triggeredEvent.type} (${triggeredEvent.eventId})`);

    await this.ruleExecution.handleMessageReceived({
      triggerEventId: triggeredEvent.eventId,
      workspaceId,
      providerKey,
      message,
      conversation,
      contact,
    });
  }
}
