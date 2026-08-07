import { Injectable, Logger } from "@nestjs/common";
import { defaultConnectorRegistry, type Connector } from "@smc/connector-sdk";
import { getPrismaClient, newId, type Contact, type Conversation, type Message, type Rule } from "@smc/database";
import {
  buildContext,
  evaluateConditionTree,
  executeActions,
  matchesTriggerScope,
  type ActionPorts,
  type ConditionNode,
  type NotificationPreferenceInput,
  type RuleTrigger,
} from "@smc/automation-engine";
import { CredentialsStoreService } from "../credentials-store/credentials-store.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { AiEnrichmentService } from "../ai/ai-enrichment.service";
import { PushService } from "../push/push.service";
import { MetricsService } from "../observability/metrics.service";
import { assertPublicWebhookTarget } from "./ssrf-guard";

const WEBHOOK_TIMEOUT_MS = 5000;

/**
 * Rule matching + execution (AUTOMATION_ENGINE.md Sections 10-13) - the
 * real replacement for EventsProcessor's Phase 1 stub rule. One workspace's
 * enabled rules for a given trigger type are looked up via the indexed
 * `triggerType` column (Section 10's "matching is indexed, not a full
 * scan"), each is scope-filtered, condition-evaluated, and - if matched -
 * executed with its own try/catch (Section 10's execution isolation: one
 * rule throwing never stops the others) and its own idempotent
 * RuleExecutionLog row (Section 10: keyed on `(ruleId, ruleVersion,
 * triggerEventId)`, so a retried event can't double-fire a rule).
 */
@Injectable()
export class RuleExecutionService {
  private readonly logger = new Logger(RuleExecutionService.name);

  constructor(
    private readonly credentialsStore: CredentialsStoreService,
    private readonly realtime: RealtimeGateway,
    private readonly aiEnrichment: AiEnrichmentService,
    private readonly push: PushService,
    private readonly metrics: MetricsService,
  ) {}

  async handleMessageReceived(input: {
    triggerEventId: string;
    workspaceId: string;
    providerKey: string;
    message: Message;
    conversation: Conversation;
    contact: Contact;
  }): Promise<void> {
    const prisma = getPrismaClient();
    const rules = await prisma.rule.findMany({
      where: { workspaceId: input.workspaceId, triggerType: "message.received", isEnabled: true },
      orderBy: { priority: "desc" },
    });
    if (rules.length === 0) return;

    const { timezone, notificationPreference } = await this.loadNotificationContext(input.workspaceId);
    // Computed once per message (Section 10's "context snapshot" model),
    // not per rule - every matched rule for this message shares the same
    // ai.* values. `undefined` when AI is disabled/out of credit - every
    // rule referencing ai.* below then just resolves undefined, per the
    // existing graceful-undefined-condition behavior (ADR-0021).
    const ai = await this.aiEnrichment.enrichMessage(input.workspaceId, input.message.bodyText);

    for (const rule of rules) {
      const trigger = rule.trigger as unknown as RuleTrigger;
      if (!matchesTriggerScope(trigger, { providerKey: input.providerKey })) continue;

      const context = buildContext({
        ruleId: rule.id,
        ruleVersion: rule.version,
        triggerEventId: input.triggerEventId,
        workspaceId: input.workspaceId,
        workspaceTimezone: timezone,
        notificationPreference,
        ai,
        conversation: {
          id: input.conversation.id,
          title: input.conversation.title,
          tags: input.conversation.tags,
          lastMessageAt: input.conversation.lastMessageAt,
        },
        message: {
          id: input.message.id,
          bodyText: input.message.bodyText,
          direction: input.message.direction as "inbound" | "outbound",
          receivedAt: input.message.receivedAt,
        },
        sender: { id: input.contact.id, displayName: input.contact.displayName, isVip: input.contact.isVip },
      });

      if (!evaluateConditionTree(rule.conditions as unknown as ConditionNode, context)) continue;

      await this.runRule(rule, input.triggerEventId, context, input.message.id, input.conversation.id, input.workspaceId);
    }
  }

  /** Runs one matched rule and durably records the outcome - never lets one rule's failure prevent the caller from continuing (Section 10's isolation guarantee). */
  private async runRule(
    rule: Rule,
    triggerEventId: string,
    context: ReturnType<typeof buildContext>,
    messageId: string | null,
    conversationId: string,
    workspaceId: string,
  ): Promise<void> {
    const prisma = getPrismaClient();

    // Idempotency (Section 10): reserve the log row first via the unique
    // constraint - a retried event racing this same rule/version/trigger
    // combination loses the race harmlessly instead of executing twice.
    const existing = await prisma.ruleExecutionLog.findUnique({
      where: {
        uq_rule_execution_logs_rule_version_trigger_event: {
          ruleId: rule.id,
          ruleVersion: rule.version,
          triggerEventId,
        },
      },
    });
    if (existing) return;

    const ports = this.buildPorts(workspaceId, conversationId);

    let result;
    try {
      result = await executeActions(rule.actions as unknown as import("@smc/automation-engine").ActionStep[], context, ports);
    } catch (err) {
      this.logger.error(`Rule ${rule.id} threw unexpectedly: ${err instanceof Error ? err.message : err}`);
      result = { status: "failure" as const, actionsExecuted: [] };
    }

    try {
      await prisma.ruleExecutionLog.create({
        data: {
          id: newId(),
          workspaceId,
          ruleId: rule.id,
          ruleVersion: rule.version,
          triggerEventId,
          messageId,
          matchedAt: new Date(),
          actionsExecuted: result.actionsExecuted,
          status: result.status,
          errorDetail: result.status === "failure" ? "All actions failed - see actionsExecuted for detail." : null,
        },
      });
    } catch (err) {
      // A duplicate-key race lost against a concurrent retry - the other
      // execution already recorded this outcome, which is the point.
      this.logger.warn(`Could not record execution log for rule ${rule.id}: ${err instanceof Error ? err.message : err}`);
    }

    this.metrics.ruleExecutionsTotal.inc({ status: result.status });

    this.realtime.emitToWorkspace(workspaceId, "rule.executed", {
      ruleId: rule.id,
      ruleName: rule.name,
      status: result.status,
      actionsExecuted: result.actionsExecuted,
    });
  }

  /**
   * Fires a `time.no_reply_after` rule when its ScheduledJob comes due
   * (AUTOMATION_ENGINE.md Section 3.3) - only `conversation` is guaranteed
   * in context (TRIGGER_REGISTRY), no `message`/`sender`, since there may
   * be no new message at all, only elapsed time.
   */
  async executeScheduledTrigger(ruleId: string, conversationId: string, workspaceId: string, triggerEventId: string): Promise<void> {
    const prisma = getPrismaClient();
    const rule = await prisma.rule.findFirst({ where: { id: ruleId, workspaceId, isEnabled: true } });
    if (!rule) return;

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) return;

    const { timezone, notificationPreference } = await this.loadNotificationContext(workspaceId);

    const context = buildContext({
      ruleId: rule.id,
      ruleVersion: rule.version,
      triggerEventId,
      workspaceId,
      workspaceTimezone: timezone,
      notificationPreference,
      conversation: { id: conversation.id, title: conversation.title, tags: conversation.tags, lastMessageAt: conversation.lastMessageAt },
    });

    if (!evaluateConditionTree(rule.conditions as unknown as ConditionNode, context)) return;

    await this.runRule(rule, triggerEventId, context, null, conversationId, workspaceId);
  }

  /** Test-run a rule against a synthetic message, without writing an execution log or side effects - AUTOMATION_ENGINE.md Section 14.2's "test before publish" idea, scoped to a single synthetic sample rather than a persisted regression suite (deferred). */
  async dryRun(rule: {
    conditions: ConditionNode;
    actions: import("@smc/automation-engine").ActionStep[];
  }, sample: { bodyText: string; senderDisplayName: string; senderIsVip: boolean }) {
    const context = buildContext({
      ruleId: "dry-run",
      ruleVersion: 0,
      triggerEventId: "dry-run",
      workspaceId: "dry-run",
      conversation: { id: "dry-run", title: null, tags: [], lastMessageAt: new Date() },
      message: { id: "dry-run", bodyText: sample.bodyText, direction: "inbound", receivedAt: new Date() },
      sender: { id: "dry-run", displayName: sample.senderDisplayName, isVip: sample.senderIsVip },
    });

    const matched = evaluateConditionTree(rule.conditions, context);
    if (!matched) return { matched, actionsExecuted: [] };

    const noopPorts: ActionPorts = {
      sendNotification: async (i) => ({ notificationId: `dry-run (would notify: "${i.title}")` }),
      applyTag: async (i) => ({ tags: [`dry-run (would tag: "${i.tag}")`] }),
      sendMessage: async (i) => ({ messageId: `dry-run (would send: "${i.bodyText}")` }),
      callWebhook: async () => ({ status: 0 }),
    };
    const result = await executeActions(rule.actions, context, noopPorts);
    return { matched, ...result };
  }

  /**
   * The workspace-wide silent-hours/VIP-override/keyword-alert setting
   * (Phase 11, docs/DATABASE.md Section 6.14) - taken from the workspace
   * owner's `NotificationPreference` row, since notifications aren't
   * per-member-targeted yet (disclosed simplification, docs/reviews/
   * phase-11-review.md). `null` when no preference row exists yet -
   * `buildContext()` treats that as "never silent, no keyword alerts."
   */
  private async loadNotificationContext(
    workspaceId: string,
  ): Promise<{ timezone: string; notificationPreference: NotificationPreferenceInput | null }> {
    const prisma = getPrismaClient();
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const owner = await prisma.workspaceMember.findFirst({ where: { workspaceId, role: "owner" }, orderBy: { joinedAt: "asc" } });
    const pref = owner
      ? await prisma.notificationPreference.findUnique({
          where: { uq_notification_preferences_workspace_user: { workspaceId, userId: owner.userId } },
        })
      : null;

    return {
      timezone: workspace?.timezone ?? "UTC",
      notificationPreference: pref
        ? {
            silentHoursStart: pref.silentHoursStart,
            silentHoursEnd: pref.silentHoursEnd,
            vipOverrideEnabled: pref.vipOverrideEnabled,
            keywordAlerts: pref.keywordAlerts,
          }
        : null,
    };
  }

  private buildPorts(workspaceId: string, conversationId: string): ActionPorts {
    const prisma = getPrismaClient();
    return {
      sendNotification: async ({ title, body }) => {
        const notification = await prisma.notification.create({
          data: { id: newId(), workspaceId, type: "reminder", title, body },
        });
        this.realtime.emitToWorkspace(workspaceId, "notification.created", {
          id: notification.id,
          title: notification.title,
          body: notification.body,
          createdAt: notification.createdAt,
        });
        // Web Push (docs/ROADMAP.md Phase 14) - reaches a subscribed
        // browser even when the tab isn't open/focused, unlike the
        // realtime WebSocket toast above. Never blocks/fails the
        // notification.send action itself if push delivery has an issue
        // (PushService already swallows per-subscription errors).
        await this.push.sendToWorkspace(workspaceId, { title, body });
        return { notificationId: notification.id };
      },

      applyTag: async ({ tag }) => {
        const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
        const tags = conversation.tags.includes(tag) ? conversation.tags : [...conversation.tags, tag];
        await prisma.conversation.update({ where: { id: conversationId }, data: { tags } });
        this.realtime.emitToWorkspace(workspaceId, "conversation.tagged", { conversationId, tags });
        return { tags };
      },

      sendMessage: async ({ bodyText }) => {
        const conversation = await prisma.conversation.findUniqueOrThrow({
          where: { id: conversationId },
          include: { linkedAccount: true, provider: true },
        });
        if (!conversation.linkedAccount) {
          throw new Error("This conversation has no connected account to send through.");
        }
        const connector = defaultConnectorRegistry.get(conversation.provider.key) as Connector;
        if (!connector.send) {
          throw new Error(`Sending is not supported for provider "${conversation.provider.key}".`);
        }
        const token = await this.credentialsStore.getSecret(conversation.linkedAccount.credentialsRef);
        const sendResult = await connector.send(
          { conversationExternalId: conversation.externalId, bodyText },
          { credential: token, linkedAccountId: conversation.linkedAccount.id },
        );
        const message = await prisma.message.create({
          data: {
            id: newId(),
            workspaceId,
            conversationId,
            externalId: sendResult.externalId,
            senderContactId: null,
            direction: "outbound",
            bodyText,
            receivedAt: new Date(),
          },
        });
        await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: message.receivedAt } });
        this.realtime.emitToWorkspace(workspaceId, "message.sent", {
          id: message.id,
          conversationId,
          bodyText,
          receivedAt: message.receivedAt,
        });
        return { messageId: message.id };
      },

      callWebhook: async ({ url, body }) => {
        await assertPublicWebhookTarget(url);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal: controller.signal,
          });
          return { status: res.status };
        } finally {
          clearTimeout(timeout);
        }
      },
    };
  }
}
