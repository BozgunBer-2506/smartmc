import { v7 as uuidv7 } from "uuid";

/**
 * The canonical event envelope. See docs/EVENT_MODEL.md Section 2 for the
 * full specification (this implements the fields needed by Phase 1's
 * vertical slice; workspaceId/correlationId/causationId are optional here
 * only because Phase 1 has no auth/workspace context wired up yet).
 */
export interface EventEnvelope<TPayload = unknown> {
  eventId: string;
  type: string;
  version: number;
  occurredAt: string;
  producedAt: string;
  producer: string;
  workspaceId: string;
  correlationId: string;
  causationId: string | null;
  payload: TPayload;
}

/** Event type names, per docs/EVENT_MODEL.md Section 6's `{resource}.{past_tense_verb}` convention. Only the events Phase 1's stubbed vertical slice actually uses - the full ~40-event catalog is specified in EVENT_MODEL.md and implemented incrementally as later phases need it. */
export const EventType = {
  MESSAGE_RECEIVED: "message.received",
  RULE_TRIGGERED: "rule.triggered",
  RULE_ACTION_EXECUTED: "rule.action_executed",
  NOTIFICATION_CREATED: "notification.created",
} as const;

export type EventTypeValue = (typeof EventType)[keyof typeof EventType];

export interface CreateEventOptions<TPayload> {
  type: EventTypeValue;
  producer: string;
  workspaceId: string;
  payload: TPayload;
  /** The event whose processing directly produced this one, if any (docs/EVENT_MODEL.md Section 2). */
  causedBy?: EventEnvelope<unknown>;
}

/**
 * Constructs a new event envelope. If `causedBy` is provided, the new
 * event inherits its `correlationId` (so the whole causal chain is
 * traceable, per docs/EVENT_MODEL.md Section 2) and sets `causationId`
 * to the specific upstream event's id.
 */
export function createEvent<TPayload>(
  options: CreateEventOptions<TPayload>,
): EventEnvelope<TPayload> {
  const now = new Date().toISOString();
  return {
    eventId: uuidv7(),
    type: options.type,
    version: 1,
    occurredAt: now,
    producedAt: now,
    producer: options.producer,
    workspaceId: options.workspaceId,
    correlationId: options.causedBy?.correlationId ?? uuidv7(),
    causationId: options.causedBy?.eventId ?? null,
    payload: options.payload,
  };
}
