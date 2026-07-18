/**
 * The connector lifecycle state machine (docs/CONNECTOR_SDK.md Section 2).
 * A LinkedAccount (docs/DATABASE.md Section 6.5) moves through exactly
 * these states; this class is the single, shared implementation every
 * connector drives instead of hand-rolling its own status tracking, so
 * "no unreachable or skipped states" (Section 16 certification item 2) is
 * a property of the SDK itself, not something each connector has to get
 * right independently.
 */
export type LifecycleState =
  | "registered"
  | "authenticating"
  | "syncing_initial"
  | "active"
  | "degraded"
  | "reauth_required"
  | "error"
  | "disconnecting"
  | "disconnected";

export const LIFECYCLE_STATES: readonly LifecycleState[] = [
  "registered",
  "authenticating",
  "syncing_initial",
  "active",
  "degraded",
  "reauth_required",
  "error",
  "disconnecting",
  "disconnected",
];

/** The "Exits to" column of docs/CONNECTOR_SDK.md Section 2's state table, verbatim. */
export const LIFECYCLE_TRANSITIONS: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
  registered: ["authenticating"],
  authenticating: ["syncing_initial", "error"],
  syncing_initial: ["active", "error"],
  active: ["degraded", "reauth_required", "disconnecting"],
  degraded: ["active", "error", "reauth_required"],
  reauth_required: ["authenticating", "disconnecting"],
  error: ["disconnecting", "authenticating"],
  disconnecting: ["disconnected"],
  disconnected: [],
};

export interface LifecycleTransitionRecord {
  from: LifecycleState;
  to: LifecycleState;
  at: string;
}

export type LifecycleTransitionListener = (from: LifecycleState, to: LifecycleState) => void;

export class IllegalLifecycleTransitionError extends Error {
  constructor(
    readonly from: LifecycleState,
    readonly to: LifecycleState,
  ) {
    const allowed = LIFECYCLE_TRANSITIONS[from];
    super(
      `Illegal connector lifecycle transition: "${from}" -> "${to}". ` +
        `Allowed from "${from}": ${allowed.length > 0 ? allowed.join(", ") : "(none - terminal state)"}.`,
    );
    this.name = "IllegalLifecycleTransitionError";
  }
}

/**
 * A single LinkedAccount's lifecycle. Every state transition is recorded
 * (for audit / debugging) and, when a listener is supplied, emitted so the
 * platform can publish it on the internal event bus (docs/CONNECTOR_SDK.md
 * Section 2: "every state transition is an event on the internal bus").
 * Wiring that listener to real EVENT_MODEL.md `connector.*` events is
 * platform integration work for whichever phase first persists a
 * LinkedAccount (docs/ROADMAP.md Phase 4 Sprint 2 / Phase 5) - this class
 * only owns the state machine itself, not its event-bus wiring.
 */
export class ConnectorLifecycle {
  private state: LifecycleState = "registered";
  private readonly history: LifecycleTransitionRecord[] = [];

  constructor(private readonly onTransition?: LifecycleTransitionListener) {}

  get current(): LifecycleState {
    return this.state;
  }

  getHistory(): readonly LifecycleTransitionRecord[] {
    return [...this.history];
  }

  /** Returns the states reachable from this connector's next legal move, without mutating state. */
  allowedTransitions(): readonly LifecycleState[] {
    return LIFECYCLE_TRANSITIONS[this.state];
  }

  transition(to: LifecycleState): void {
    const allowed = LIFECYCLE_TRANSITIONS[this.state];
    if (!allowed.includes(to)) {
      throw new IllegalLifecycleTransitionError(this.state, to);
    }
    const from = this.state;
    this.state = to;
    this.history.push({ from, to, at: new Date().toISOString() });
    this.onTransition?.(from, to);
  }
}

/**
 * Verifies the shared transition table itself has no unreachable state
 * (every state other than the entry state "registered" has at least one
 * inbound edge) and no dead-end non-terminal state (every state other than
 * the terminal "disconnected" has at least one outbound edge). Used by the
 * certification suite (Section 16 item 2) - this is a property of the SDK's
 * lifecycle definition, verified once, not re-derived per connector.
 */
export function checkLifecycleGraphIntegrity(): { reachable: boolean; noDeadEnds: boolean; unreachable: LifecycleState[]; deadEnds: LifecycleState[] } {
  const inbound = new Set<LifecycleState>(["registered"]);
  for (const targets of Object.values(LIFECYCLE_TRANSITIONS)) {
    for (const target of targets) {
      inbound.add(target);
    }
  }
  const unreachable = LIFECYCLE_STATES.filter((state) => !inbound.has(state));

  const deadEnds = LIFECYCLE_STATES.filter(
    (state) => state !== "disconnected" && LIFECYCLE_TRANSITIONS[state].length === 0,
  );

  return {
    reachable: unreachable.length === 0,
    noDeadEnds: deadEnds.length === 0,
    unreachable,
    deadEnds,
  };
}
