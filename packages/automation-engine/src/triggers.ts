import { TriggerType, type ContextObject, type RuleTrigger } from "./types";

/** The registered-capability trigger catalog (AUTOMATION_ENGINE.md Section 3.4) - a lookup table, not a hardcoded switch buried in the matcher. Phase 10 registers two entries; a future connector or contact/conversation-event trigger is added here, not by editing the matcher. */
export interface TriggerDescriptor {
  type: string;
  category: "message" | "time";
  /** Context Object sections this trigger guarantees populated (Section 3.2) - documentation today; Phase 10 has no visual builder to enforce it against at rule-build time (deferred). */
  contextGuarantees: string[];
}

export const TRIGGER_REGISTRY: TriggerDescriptor[] = [
  { type: TriggerType.MESSAGE_RECEIVED, category: "message", contextGuarantees: ["message", "conversation", "sender"] },
  { type: TriggerType.TIME_NO_REPLY_AFTER, category: "time", contextGuarantees: ["conversation"] },
];

/** The scope-filter pre-match (AUTOMATION_ENGINE.md Section 3.2) - a cheap check before condition evaluation runs. Phase 10's only filter is provider key. */
export function matchesTriggerScope(trigger: RuleTrigger, event: { providerKey?: string }): boolean {
  if (!trigger.scope?.providerKey) return true;
  return trigger.scope.providerKey === event.providerKey;
}

export function isRegisteredTrigger(type: string): boolean {
  return TRIGGER_REGISTRY.some((t) => t.type === type);
}

/** Recomputed from `conversation.lastMessageAt` at read time (Phase 10's simplification) rather than a persisted flag - correct at this scale (docs/DATABASE.md Section 6.12-adjacent reasoning applied here). */
export function isConversationStale(lastMessageAt: Date | null, hours: number): boolean {
  if (!lastMessageAt) return false;
  const elapsedHours = (Date.now() - lastMessageAt.getTime()) / (1000 * 60 * 60);
  return elapsedHours >= hours;
}

export function buildContext(input: {
  ruleId: string;
  ruleVersion: number;
  triggerEventId: string;
  workspaceId: string;
  conversation: { id: string; title: string | null; tags: string[]; lastMessageAt: Date | null };
  message?: { id: string; bodyText: string; direction: "inbound" | "outbound"; receivedAt: Date };
  sender?: { id: string; displayName: string; isVip: boolean };
}): ContextObject {
  return {
    message: input.message
      ? {
          id: input.message.id,
          bodyText: input.message.bodyText,
          direction: input.message.direction,
          receivedAt: input.message.receivedAt.toISOString(),
        }
      : undefined,
    conversation: {
      id: input.conversation.id,
      title: input.conversation.title,
      tags: input.conversation.tags,
      lastMessageAt: input.conversation.lastMessageAt?.toISOString() ?? null,
      isStale: (hours: number) => isConversationStale(input.conversation.lastMessageAt, hours),
    },
    sender: input.sender,
    workspace: { id: input.workspaceId, isSilentHours: false },
    execution: { ruleId: input.ruleId, ruleVersion: input.ruleVersion, triggerEventId: input.triggerEventId },
  };
}
