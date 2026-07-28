/**
 * Core types for the Automation Engine (docs/AUTOMATION_ENGINE.md), scoped
 * to Phase 10's realistic delivery slice - see docs/reviews/phase-10-review.md
 * for the full list of disclosed simplifications against the design doc.
 */

/** Trigger type keys - AUTOMATION_ENGINE.md Section 3.1/3.2. Phase 10 implements two: a message trigger (event-driven) and a relative-time trigger (scheduled). Every other category in Section 3.1 (contact/conversation/workspace/manual/event/location) is deferred, not silently dropped - see the phase review. */
export const TriggerType = {
  MESSAGE_RECEIVED: "message.received",
  TIME_NO_REPLY_AFTER: "time.no_reply_after",
} as const;
export type TriggerTypeValue = (typeof TriggerType)[keyof typeof TriggerType];

export interface RuleTrigger {
  type: TriggerTypeValue;
  /** Scope filters (AUTOMATION_ENGINE.md Section 3.2) - a coarse, cheap pre-filter distinct from conditions. Phase 10 supports `providerKey` only. */
  scope?: { providerKey?: string };
  /** Trigger-specific params. `time.no_reply_after` requires `hours`. */
  params?: { hours?: number };
}

/** The Context Object (AUTOMATION_ENGINE.md Section 6) - message, conversation, sender, workspace, execution (Phase 10), plus `ai` (Phase 13, ADR-0021 - real when the workspace has AI enabled and credit available, `undefined` otherwise, exactly matching Section 9's "only for workspaces with AI enabled" boundary). `automation_memory`/`location` remain deferred (Section 6/3.1). */
export interface ContextObject {
  message?: {
    id: string;
    bodyText: string;
    direction: "inbound" | "outbound";
    receivedAt: string;
    /** Phase 11 (docs/DATABASE.md Section 6.14's `keyword_alerts`) - true if `bodyText` contains any of the workspace owner's configured keyword alerts, case-insensitive. `false` when no keywords are configured, never `undefined`. */
    matchesKeywordAlert: boolean;
  };
  conversation: {
    id: string;
    title: string | null;
    tags: string[];
    isStale: (hours: number) => boolean;
    lastMessageAt: string | null;
  };
  sender?: {
    id: string;
    displayName: string;
    isVip: boolean;
  };
  workspace: {
    id: string;
    /** Real as of Phase 11 (docs/DATABASE.md Section 6.14) - computed from the workspace owner's `NotificationPreference.silentHoursStart/End` against the current time in the workspace's timezone. `false` when no silent hours are configured. Uses the *owner's* preference as the workspace-wide setting - a disclosed simplification until per-member notification targeting exists (see docs/reviews/phase-11-review.md). */
    isSilentHours: boolean;
    /** AUTOMATION_ENGINE.md Section 4.2's `workspace.isVipOverrideActive` - true only when silent hours are currently active AND the message's sender is VIP AND the owner's `vipOverrideEnabled` is true. `false` on any trigger with no `sender` in context. */
    isVipOverrideActive: boolean;
  };
  execution: {
    ruleId: string;
    ruleVersion: number;
    triggerEventId: string;
  };
  /**
   * AUTOMATION_ENGINE.md Section 6/9, ADR-0021 - populated only when the
   * workspace has AI enabled and had credit available at the moment this
   * context was built (computed once by the caller, not lazily inside the
   * engine - Section 10's "context snapshot for determinism" applies here
   * too). A condition referencing `ai.sentiment` on a trigger where this
   * is `undefined` resolves to `undefined` in `resolveField`, which every
   * operator already treats as non-matching - the same graceful-
   * degradation behavior every other optional context field gets, no
   * special-casing needed.
   */
  ai?: {
    sentiment: "positive" | "neutral" | "negative";
    classification: string;
  };
}

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "matches_regex"
  | "greater_than"
  | "less_than"
  | "is_true"
  | "is_false";

/** A leaf condition (AUTOMATION_ENGINE.md Section 4.1): a field reference into the Context Object, an operator, and a comparison value. */
export interface ConditionLeaf {
  field: string; // dot-path, e.g. "sender.isVip", "message.bodyText"
  operator: ConditionOperator;
  value?: string | number | boolean;
}

/** A condition group (AND/OR/NOT) nesting leaves or further groups, to arbitrary depth - AUTOMATION_ENGINE.md Section 4.1. */
export interface ConditionGroup {
  op: "AND" | "OR" | "NOT";
  children: ConditionNode[];
}

export type ConditionNode = ConditionLeaf | ConditionGroup;

export function isConditionGroup(node: ConditionNode): node is ConditionGroup {
  return "op" in node && "children" in node;
}

/** Action types - AUTOMATION_ENGINE.md Section 5.1. Phase 10 implements four of the catalog's examples; the rest (ai.*, and any provider-specific action) are deferred, not registered. */
export const ActionType = {
  NOTIFICATION_SEND: "notification.send",
  TAG_APPLY: "tag.apply",
  MESSAGE_SEND: "message.send",
  WEBHOOK_CALL: "webhook.call",
} as const;
export type ActionTypeValue = (typeof ActionType)[keyof typeof ActionType];

export interface ActionStep {
  type: ActionTypeValue;
  params: Record<string, string>;
}

/** Result of one action step (AUTOMATION_ENGINE.md Section 5.4) - partial success across a rule's actions is representable, never collapsed to a single pass/fail. */
export interface ActionResult {
  type: ActionTypeValue;
  status: "success" | "error";
  output?: Record<string, unknown>;
  error?: string;
}

export interface RuleExecutionResult {
  status: "success" | "partial_failure" | "failure";
  actionsExecuted: ActionResult[];
  errorDetail?: string;
}

/** The concrete side effects an action step performs, injected by the caller (apps/api) rather than imported directly - keeps this package free of NestJS/Prisma/connector-sdk specifics, matching AUTOMATION_ENGINE.md Section 2's "registered capability" spirit without a full plugin registry (deferred - four hardcoded ports is the honest scope for Phase 10). */
export interface ActionPorts {
  sendNotification(input: { title: string; body: string }): Promise<{ notificationId: string }>;
  applyTag(input: { tag: string }): Promise<{ tags: string[] }>;
  sendMessage(input: { bodyText: string }): Promise<{ messageId: string }>;
  callWebhook(input: { url: string; body: string }): Promise<{ status: number }>;
}
