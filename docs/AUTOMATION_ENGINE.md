# Smart Message Center - AUTOMATION_ENGINE.md

```yaml
Title: AUTOMATION_ENGINE.md
Version: 1.1
Status: Approved
Owner: Product / Architecture
Last Updated: 2026-07-18
Depends On:
  - PRODUCT.md
  - ARCHITECTURE.md
  - DATABASE.md
  - API.md
Related ADRs:
  - ADR-0004
  - ADR-0005
  - ADR-0012
```

This document designs Smart Message Center's automation engine as the product's flagship capability - not a feature bolted onto the unified inbox, but the reason the unified inbox exists. No implementation code, no schema syntax: this is the design a decade of engineering teams will build against.

---

## 1. Why This Document Exists, and Why It's Different From "Zapier for Messaging"

Every unified-inbox competitor (PRODUCT.md's competitor analysis) either has no automation layer (Beeper, Rambox, Franz, Shift) or has one scoped to a single channel (Slack AI, Superhuman's snippets). Generic automation platforms (Zapier, IFTTT, Make) solve a fundamentally different problem: connecting *apps* to each other through their APIs, with no shared understanding of what a "conversation," a "contact," or "urgency" means. A Zapier rule that says "if a Gmail arrives, post to Slack" has no concept of who the sender is to you, whether they're a VIP, whether you're in silent hours, or whether you already owe them a reply from three days ago.

**Smart Message Center's automation engine is different in kind, not degree, because it runs on top of the canonical cross-channel domain model (DATABASE.md) rather than beside it.** A rule here doesn't just react to "a message arrived" - it reacts to "a message arrived, from a contact who is VIP, in a conversation that's been silent for 6 days, during your configured silent hours, referencing an invoice you tagged Finance last week." That composite context is only possible because the unified inbox already normalized every provider into one `Message`/`Conversation`/`Contact` shape - and, specifically, because every "who is this" question in that sentence is answered by **IdentityGraph** (`ARCHITECTURE.md` Section 13, [ADR-0012](adr/0012-identitygraph-canonical-identity-layer.md)), the platform's canonical identity resolution layer, rather than by a raw provider account. **This is the moat**: a competitor can copy the visual rule-builder UI in a weekend. They cannot copy IdentityGraph without first doing the multi-year work of building a genuinely unified, provider-agnostic, ToS-compliant identity resolution layer underneath it. Section 15 makes this argument in full.

Everything below is designed against one test: **could a generic automation tool, wired up to our webhooks, replicate this rule?** Where the answer is yes, we haven't built anything defensible. Where the answer is no - because the rule needs relationship history, cross-channel identity, or silent-hours state that only exists inside our own domain model - that's the engine doing its job.

---

## 2. Design Principles

1. **Messaging-native primitives, not generic app-to-app plumbing.** "Sender is VIP," "conversation is stale," "this is the first message from this contact ever," "silent hours are active" are first-class trigger/condition primitives, not something a user assembles from five generic building blocks.
2. **Context, not just events.** Every rule execution has access to a rich, structured Context Object (Section 6) - not just the triggering message, but the sender's relationship history, the conversation's state, the workspace's settings, and (optionally) AI-derived signals. This is what makes composite, human-sounding rules ("if my boss messages and I haven't replied in an hour") expressible as data instead of code.
3. **Inspectable, never magical** (carried forward from PRODUCT.md's UI Principles). Every rule can be tested before it's live (Section 11), every execution is traceable after the fact (Section 13), and every failure is visible, not silent (Section 9-10).
4. **Composable, not flat.** Conditions nest (Section 4), actions chain and branch (Section 5), and both conditions and actions can be extracted into named, reusable snippets shared across rules and, eventually, across workspaces via the marketplace (Section 16). This compositionality is what turns "100 automation examples" (PRODUCT.md) into an actual combinatorial space users can build inside, not just a fixed menu.
5. **A platform, not a feature.** Trigger types, condition primitives, and action types are themselves data - registered capabilities (Section 3.4), not a hardcoded switch statement. This is what lets Phase 18's connector marketplace add new triggers/actions (a new provider ships its own trigger types) without touching the automation engine's core, and it's what powers `API.md`'s `ruleBuilderSchema` GraphQL introspection query the visual builder renders itself from.
6. **Every automation degrades gracefully without AI.** Per PRODUCT.md's AI Features principle, natural-language rule creation and AI-assisted suggestions (Sections 8-9) are conveniences layered on top of a fully-capable visual builder - never the only way to build a rule.

---

## 3. The Trigger Model

A trigger defines *when* a rule is considered for evaluation. Every rule has exactly one trigger (a rule reacting to multiple distinct event types is expressed as multiple rules sharing conditions/actions via snippets, Section 4.4/5.5 - keeping "what starts this rule" unambiguous is worth more than saving a few rule definitions).

### 3.1 Trigger Categories

| Category | Description | Examples |
|---|---|---|
| **Message triggers** | Fire on message lifecycle events within a conversation | Message received, message sent, message edited, message reacted-to, message read by recipient |
| **Contact triggers** | Fire on changes to a Contact's state, independent of any single message | Contact marked VIP, first-ever message from a new contact, contact's relationship health score drops, contact identity merged across providers |
| **Conversation triggers** | Fire on conversation-level state changes | Conversation goes stale (no activity N days), conversation archived/reopened, participant added/removed, conversation reassigned (team tier) |
| **Workspace triggers** | Fire on workspace/account-level events | Team member joins/leaves, plan changes, a LinkedAccount's status changes to `reauth_required`, AI credit balance crosses a threshold |
| **Time-based triggers** | Fire relative to a point in time, not tied to a single event | No reply after N hours/days, recurring schedule (daily/weekly digest), a specific date/time, N days before/after a stored date (renewal, birthday) |
| **Scheduled triggers** | Cron-style, workspace-timezone-aware, fully time-driven | "Every Monday 9am," "the 1st of every month," "every 15 minutes" (for health-check-style rules) |
| **Manual triggers** | Fired explicitly by a human action, not by the system | A user clicks "Run Now" on a rule, a Quick Action button embedded in a message (`API.md`'s inline-action pattern), a bulk "apply this rule to selected conversations" action |
| **Event triggers** (cross-cutting) | Fire on system-level events not owned by any one category above | A webhook received from an external system (Phase 18 - a rule can itself be *triggered by* a third-party event, not just execute actions toward one), an AI job completing (a summary or classification finishes async) |
| **Location-aware triggers** *(future, Phase 14+)* | Fire based on the user's physical location via the mobile app | Arriving at/leaving a defined location (geofence), entering a "commute" state inferred from calendar + location, crossing a timezone boundary while traveling |

### 3.2 Trigger Anatomy

Every trigger, regardless of category, is described by the same four-part shape:

- **Type** - the specific trigger (`message.received`, `time.no_reply_after`, `contact.became_vip`, etc.), drawn from the registered capability catalog (Section 3.4). Naming follows the same `{resource}.{past_tense_verb}` convention as `API.md` Section 14.1's internal event naming, deliberately - a trigger type and an internal domain event are the same vocabulary, which is what lets every new domain event automatically become a candidate trigger type with zero translation layer.
- **Scope filters** - narrows which instances of the type-matching event actually reach condition evaluation (e.g. `message.received` scoped to `provider: telegram` or `conversation.type: dm`) - a coarse, indexed pre-filter, distinct from conditions (Section 4), which evaluate richer logic against the Context Object *after* a trigger fires. This split exists for performance: scope filters are cheap, indexed lookups that keep the rule-matching step fast even at high message volume (DATABASE.md Section 18's `messages` write-volume bottleneck is exactly why this separation matters); conditions are where the expressive, potentially expensive logic lives.
- **Debounce/coalescing policy** - optional, for high-frequency triggers (e.g. "message reacted-to" on a busy group chat): collapse N rapid-fire events into one evaluation, configurable per trigger type's registered default and overridable per rule.
- **Context requirements** - a declared list of what Context Object sections (Section 6) this trigger type guarantees are populated when it fires - e.g. `message.received` guarantees `message`, `conversation`, `sender`; `time.no_reply_after` guarantees `conversation` and a synthetic `elapsed` value but no `message` (there may be no new message at all, only elapsed time). This declaration is what lets the visual builder (Section 7) only offer conditions/variables that are actually available for a given trigger, instead of letting a user build a rule that references data that will be null at execution time.

### 3.3 Time-Based & Scheduled Triggers, Specifically

These deserve their own design attention because they are the hardest to get right and the most differentiating (PRODUCT.md's "no reply after 2 days" is the single most-cited example across personas):

- **Relative time triggers** (`no_reply_after`, `stale_after`) are not implemented as "check every message for staleness on a timer" (which doesn't scale) - they are computed once, as a `ScheduledJob` (DATABASE.md Section 6.13) created at the moment the *originating* condition becomes true (e.g. the moment a message goes unanswered, a job is scheduled for now+48h) and cancelled if the condition resolves first (a reply arrives). This is why DATABASE.md deliberately made `scheduled_jobs` a durable Postgres table, not just a Redis delay: a relative-time trigger's correctness depends on that job surviving a restart.
- **Absolute/recurring schedules** are workspace-timezone-aware by default (DATABASE.md `workspaces.timezone`) - "every day at 9am" means 9am in the workspace's timezone, and follows DST transitions correctly, not a fixed UTC offset that silently drifts twice a year. This sounds minor; it is one of the most common correctness bugs in naive scheduling systems and a direct source of user trust erosion if wrong (per PRODUCT.md's UI Principle that the "Needs You" surfaces must always be trustworthy - the Morning Briefing depends on this).

### 3.4 Triggers Are Registered Capabilities, Not a Fixed List

Every trigger type is a row in a registry (parallel in spirit to DATABASE.md's `providers` lookup table, Section 6.4) describing its type key, category, scope-filter schema, context guarantees, and debounce default. **This is what makes the engine a platform**: a new connector (Phase 6-8, or a third-party Phase 18 connector) registers its own trigger types (`discord.reaction_added`, `slack.thread_resolved`) without the automation engine's core ever being modified - the visual builder and the NL-to-rule pipeline (Section 8) both discover available triggers by querying this registry, exactly mirroring how `API.md`'s `ruleBuilderSchema` GraphQL query is meant to work.

---

## 4. The Condition Model

Conditions decide, given a fired trigger and its Context Object, whether a rule's actions should run. This is where nested logic, variables, and messaging-native semantics live.

### 4.1 Nested Condition Trees

A rule's conditions are a tree, not a flat list: **groups** (`AND` / `OR` / `NOT`) containing either more groups or **leaf conditions**, to arbitrary depth. This is the direct, deliberate answer to the brief's "nested conditions" requirement and to real automation needs PRODUCT.md's examples imply but a flat AND-only list can't express - e.g. "(sender is VIP OR message contains 'urgent') AND NOT (silent hours active AND sender is not exempted)."

Every leaf condition has the same shape: a **field reference** (a path into the Context Object or a Variable, Section 4.3/6), an **operator** (`equals`, `contains`, `matches_regex`, `in`, `greater_than`, `is_within_last`, `changed_from`, etc. - operator availability is type-aware: a timestamp field only offers time operators, a VIP boolean only offers `is`/`is not`), and a **comparison value** (a literal, a Variable reference, or - for a small, deliberately bounded set of cases - an AI-derived value, Section 9).

### 4.2 Messaging-Native Condition Primitives

Beyond generic field comparisons, a fixed catalog of higher-level, pre-built condition primitives exists specifically because they'd otherwise require several nested leaf conditions to express correctly every time - these are the primitives a generic automation tool cannot offer, because they require **IdentityGraph's** relationship/history model (`ARCHITECTURE.md` Section 13), not just a raw provider webhook payload:

- `sender.isVip`, `sender.tags contains X`, `sender.isFirstContact` (never messaged before, ever, across any channel)
- `conversation.isStale(duration)`, `conversation.hasUnresolvedAsk` (AI-optional, Section 9), `conversation.responseLagIsAbnormal` (compares current silence against that contact's historical average reply lag - directly serving PRODUCT.md problem #87)
- `workspace.isSilentHours`, `workspace.isVipOverrideActive`
- `message.sentiment` (AI-optional), `message.containsAttachmentType(invoice|contract|resume|image)`, `message.language` (for translation-triggering rules)
- `relationship.owesReplyTo` / `relationship.isOwedReplyBy` (the Waiting On concept, PRODUCT.md solutions #33-34/40, exposed as a queryable condition, not just a UI list)

### 4.3 Variables

Three distinct kinds, each with a different lifecycle and trust level - conflating them is a common design mistake this engine deliberately avoids:

1. **Context variables** - read-only, resolved fresh at execution time from the Context Object (`{{message.body}}`, `{{sender.displayName}}`, `{{conversation.tags}}`). Always available, never user-editable, always current.
2. **Workspace variables** - user-defined, workspace-scoped key/value pairs set once and referenced across many rules (`{{vars.escalation_email}}`, `{{vars.support_sla_hours}}`) - the mechanism that lets a template (Section 16) be portable: a shared rule template references `{{vars.boss_contact_id}}` rather than a hardcoded contact, and importing it prompts the user to map their own value.
3. **Computed/derived variables** - the output of a prior step in the same execution (an AI summary, a webhook response, Section 5.4) available to later steps by name (`{{steps.summarize.output}}`). Scoped to a single execution, never persisted as workspace state.

Variables are always resolved and rendered into a preview *before* an action executes irreversibly - the rule tester (Section 11) and simulator (Section 12) exist specifically so a user sees `{{sender.displayName}}` resolve to "Deniz Yılmaz" before trusting it in a live auto-reply template.

### 4.4 Condition Snippets (Reusable, Named Condition Groups)

A condition subtree can be extracted into a **named, workspace-scoped Condition Snippet** (e.g. "Business Hours," "VIP or Escalated," "Looks Like Spam") and referenced by any rule as a single leaf. This is a direct, deliberate platform-design choice, not a convenience feature: it means (a) a user refines one snippet and every rule using it improves at once, (b) snippets are exactly what gets published to the marketplace (Section 16) as standalone, composable building blocks independent of a full rule, and (c) it's the mechanism that makes "200+ automation examples" actually maintainable as a product surface - many of Section 17's examples share snippets like "VIP or urgent," not independently duplicated logic.

---

## 5. The Action Model

### 5.1 Action Anatomy

An action has a **type** (drawn from the same kind of registered-capability catalog as triggers, Section 3.4 - `notification.send`, `tag.apply`, `message.send`, `webhook.call`, `ai.summarize`, etc.), a **parameter set** (type-specific, with Variable interpolation throughout, Section 4.3), and an **execution mode** (`sync` - must complete before the next action runs, or `async` - fire-and-continue).

### 5.2 Action Chains, Branching, and Parallelism

Actions are not just an ordered flat list - the action graph supports:

- **Sequential chaining** - the default: actions run in order, each able to reference prior steps' outputs (`{{steps.N.output}}`).
- **Conditional branching within actions** - an action step can itself be an `if/else` node re-evaluating a (typically lighter-weight) condition against updated context (e.g. "send the auto-reply; if the AI summary flagged this as angry, ALSO escalate" - the escalation is conditioned on a prior step's output, not just the original trigger's conditions).
- **Parallel execution** - independent actions (e.g. "tag as Finance" and "notify accountant") that don't depend on each other's output run concurrently, reducing end-to-end rule latency - relevant at scale (DATABASE.md Section 18) once rules commonly have 5+ actions.
- **Delayed actions** - a step in the chain that pauses for a duration or until a condition becomes true before continuing (distinct from a separate scheduled trigger - this is "part of one automation's story," e.g. "send now, then if no reaction in 1 hour, follow up" as one rule, not two).

### 5.3 Composite Actions (Reusable Action Macros)

Symmetric to Condition Snippets (Section 4.4): a named, reusable sequence of actions (e.g. "Escalate to Manager" = notify manager + tag Escalated + create Waiting-On entry) usable as a single action step in any rule. This is the second half of what makes the marketplace (Section 16) sell something more valuable than single rules: **snippets and composite actions are the reusable primitives; rules are compositions of them; templates are curated bundles of rules.** Three tiers of reusability, not one.

### 5.4 Action Output & Failure Semantics

Every action produces a structured result (`success`, `output` payload, or `error` with an `API.md`-Section-5-shaped RFC 7807 body) recorded in that execution's trace (Section 13) regardless of outcome - this is what Section 9-10's retry/failure policy and Section 14's debugger both operate on, and it is why `DATABASE.md`'s `rule_execution_logs.actions_executed` is `jsonb` rather than a single pass/fail boolean: partial success (3 of 4 actions completed) must be representable and inspectable, not collapsed into a single misleading status.

---

## 6. Context Awareness: The Context Object

The single most differentiating piece of the engine (Section 1). Every rule execution is handed a structured, versioned Context Object assembled at the moment the trigger fires:

| Section | Contents | Populated when |
|---|---|---|
| `message` | The triggering message (if any): body, format, attachments, sender, timestamps | Message-category triggers |
| `conversation` | Full conversation state: participants, tags, last-activity time, staleness, archived status | Most trigger categories |
| `sender` / `contact` | The relevant Contact's full profile, resolved by **IdentityGraph** (`ARCHITECTURE.md` Section 13) - never a raw provider account: VIP status, tags, cross-channel identities, relationship history (first-contact date, historical response lag, prior conversation summaries) | Any trigger with an identifiable person involved |
| `workspace` | Silent-hours state, timezone, plan tier, feature flags, workspace variables | Always |
| `execution` | This execution's own metadata: which rule, which version, a unique execution id, prior step outputs within this run | Always |
| `automation_memory` | Small, rule-scoped persistent state that survives across executions of the *same rule* for the *same conversation/contact* (e.g. a counter: "this is the 3rd time this rule matched for this contact this month") - opt-in per rule, not global mutable state | When the rule declares it needs memory |
| `ai` *(optional)* | Sentiment, summary, classification, detected commitments - populated only if the workspace has AI enabled and the rule requests it | Only when explicitly used, per PRODUCT.md's AI-optional principle |
| `location` *(future, Phase 14+)* | The user's current location/geofence state, from the mobile app | Only for location-aware triggers |

**Why this is designed as one coherent object, versioned as a whole, rather than each trigger inventing its own payload shape**: it's what lets conditions, variables, and the simulator (Section 12) all work identically regardless of which trigger fired - a condition written against `sender.isVip` behaves the same whether the trigger was `message.received` or `contact.became_vip`, because both populate the same `sender` section from the same underlying Contact model. A generic automation tool wiring together disconnected app webhooks has no equivalent unifying object to build this consistency on top of - each integration's payload is shaped by that third party's API, not by a shared domain model. This is Section 1's moat, made concrete.

---

## 7. Visual Rule Builder

- A canvas-based editor: one Trigger card, a nested Condition tree (visually indented groups with AND/OR/NOT toggles, matching Section 4.1), and an Action chain (with visible branch/parallel/delay nodes, matching Section 5.2) - never a code editor, never optional-but-really-required YAML, per PRODUCT.md's "no code" mandate.
- **Self-describing, not hardcoded**: the builder renders its available triggers/conditions/actions by querying the registered-capability catalog (Section 3.4/5.1) via `API.md`'s `ruleBuilderSchema` GraphQL introspection - adding a new action type to the platform makes it appear in the builder automatically, with zero frontend redeploy, which is the concrete payoff of Section 2's "platform, not feature" principle.
- **Type-aware field/operator suggestion**: because every field reference and operator is typed (Section 4.1) and every trigger declares its Context guarantees (Section 3.2), the builder only ever offers valid combinations - a user cannot accidentally build a rule referencing `message.body` on a trigger that doesn't guarantee a message exists.
- **Live preview panel**: as a rule is built, a preview shows the rule's plain-language description ("When a message is received, if the sender is VIP and it's during silent hours, then notify me immediately and log it as urgent") generated from the rule's structure - the inverse of Section 8's NL-to-rule direction, and equally important for trust: a user should never have to mentally compile their own rule to know what it does.

---

## 8. Natural Language Rule Creation

Formalizes PRODUCT.md's AI Features commitment ("AI proposes automation rules, never auto-activates") as a concrete pipeline:

1. **Intent parsing**: a natural-language prompt ("remind me if my boss messages and I don't reply in an hour") is parsed against the registered trigger/condition/action catalog (Section 3.4/5.1) - not a general-purpose code generator, a constrained mapping onto the same primitives the visual builder uses. This constraint is deliberate: the output is guaranteed to be a valid, inspectable rule in the same model as everything else, never an opaque script.
2. **Entity resolution**: references to people ("my boss"), time windows ("an hour"), and channels are resolved against the workspace's actual Contacts/settings, with ambiguity surfaced back to the user (e.g. "did you mean [contact match]?") rather than guessed silently.
3. **Confidence-scored draft**: the result is a fully-formed, editable draft rule opened directly in the visual builder (Section 7), `isDraft: true` exactly as `API.md` Section 10.8 specifies - the user sees precisely the same nested-condition/action-chain representation a manually-built rule would have, edits if needed, and explicitly saves/activates it. **There is no path from natural language directly to an active rule** - this is a hard product boundary, not a missing convenience.
4. **Failure is explicit**: if the prompt can't be confidently mapped to the primitive catalog, the system says so and asks a clarifying question or falls back to opening an empty builder with the prompt as a starting comment - never silently produces a wrong rule.

---

## 9. AI-Assisted Rules (Optional, Never Load-Bearing)

Distinct from Section 8 (NL-to-rule creation): this is AI assisting *within* an already-being-built rule, and AI *suggesting* rules unprompted from observed behavior.

- **Condition/value assistance**: suggesting a regex pattern from an example, suggesting a sentiment threshold from a few labeled examples.
- **AI-derived condition values** (Section 4.1's "bounded set of cases"): a condition can reference `ai.sentiment`, `ai.detectedCommitment`, `ai.classification` - but only for workspaces with AI enabled, and every rule using an AI-derived condition is visually flagged in the builder (matching PRODUCT.md's UI Principle that AI-generated content is always visually distinct) so a user always knows part of their rule's logic depends on a model, not just deterministic data.
- **Proactive rule suggestions**: the system may notice a pattern (e.g. "you manually tag every message from this domain as Finance - want a rule for that?") and propose a draft rule the same way Section 8 does - suggested, never created, never activated without explicit user action.
- **Hard boundary, restated from PRODUCT.md**: AI never authors an action that sends a message *as the user* without that exact message having been shown to and confirmed by the user first, for this specific execution. An AI-suggested *rule* can be pre-approved by the user in advance (that's the whole point of a rule); an AI *improvising new outbound content per-message* at execution time without per-message confirmation is not permitted, ever - this is the one line PRODUCT.md draws that this engine's design must never cross, regardless of how good the underlying model gets.

---

## 10. Execution Engine

- **Event-driven, per ARCHITECTURE.md's event bus (ADR-0005)**: a fired trigger publishes an internal event; rule-matching is a queue consumer, not inline in the request path - a burst of matching rules never blocks message ingestion.
- **Matching is indexed, not a full scan**: rules are indexed by trigger type + scope filters (Section 3.2) per workspace, so a workspace with 200 active rules doesn't evaluate all 200 on every message - only the subset whose trigger type and scope filters match even get to condition evaluation.
- **Execution isolation**: each rule's execution is its own unit of work (its own `rule_execution_logs` row, DATABASE.md Section 6.12) - one rule throwing an unexpected error never prevents other matched rules for the same event from running. This is a hard isolation boundary, not just a best effort.
- **Idempotency**: every execution is keyed on `(rule_id, rule_version, trigger_event_id)` - a retried event (connector worker retry, queue redelivery) can never cause the same rule to fire twice for the same underlying event, extending `ARCHITECTURE.md`'s event-flow idempotency guarantee into the automation layer specifically.
- **Context snapshot for determinism**: the Context Object (Section 6) is assembled once at the start of an execution and treated as immutable for that execution's duration - a slow-running rule chain doesn't see the world shift under it mid-execution, which is also what makes the debugger (Section 14) and simulator (Section 12) able to faithfully replay an execution.
- **Sandboxed, timeout-bounded external calls**: webhook actions and AI actions run with an enforced timeout and no ability to affect other rules' execution environment - a slow or hanging third-party endpoint degrades only the rule that called it.

---

## 11. Retry Policy

- **Per-action, not per-rule**: each action type has a registered default retry policy (exponential backoff with jitter, matching `API.md` Section 8's retry philosophy applied here), overridable per rule for actions where the default doesn't fit (e.g. a time-sensitive notification might have zero retries - a stale "urgent" alert delivered late is arguably worse than not delivered).
- **Retryable vs. terminal errors are distinguished explicitly**: a `429`/`503`-class failure from a provider API is retried; a `403`/`422`-class failure (e.g. "this contact blocked the bot," "invalid template variable") is terminal and goes straight to Section 12's failure policy without wasting retry budget on something that will never succeed.
- **Bounded retry budget per execution**: a hard cap (e.g. 5 attempts, ~30 minutes total window) prevents a persistently-failing action from generating unbounded background load - after which it becomes a Dead Letter Queue entry (Section 13).

## 12. Failure Policy

- **Partial failure is a first-class, visible state** (Section 5.4), not collapsed to a binary pass/fail - a rule with 4 actions where 3 succeeded and 1 failed is reported exactly that way in the execution log and, where relevant, to the user.
- **Fallback actions**: a rule can declare an explicit fallback action chain to run if a primary action exhausts its retries (e.g. "try to auto-reply via the provider API; if that fails, notify me instead so I reply manually") - failure handling is itself part of the rule's designed behavior, not just an engine-level log entry nobody sees.
- **Circuit breaker per external integration**: if a specific webhook target or provider action repeatedly fails across *multiple* rule executions (not just retries within one), the engine trips a circuit breaker for that specific target, pauses further attempts, and notifies the rule's owner - this is what prevents PRODUCT.md automation example #93's scenario ("a rule may be silently failing") from ever being silent in practice.
- **Auto-disable with notification, never silent decay**: a rule that fails outright (not partial - total failure) N times consecutively is automatically disabled and the owner is notified with a direct link to the failing execution's trace (Section 14) - an automation the user forgot about should never keep failing invisibly forever; it should surface itself and stop.

## 13. Dead Letter Queue

- Executions that exhaust retry budget (Section 11) and have no successful fallback (Section 12) land in a Dead Letter Queue: a durable, queryable record (extending `DATABASE.md`'s `rule_execution_logs` with a `status: dead_lettered` state) capturing the full Context Object snapshot, the failing action, and the terminal error.
- **DLQ entries are replayable**, individually or in bulk, once the underlying cause is fixed (e.g. a LinkedAccount was reauthorized) - replay re-runs the exact original Context snapshot (Section 10's determinism guarantee is what makes this safe and meaningful, not a re-evaluation against possibly-changed current state).
- Visible in a dedicated UI surface, not buried in logs - per PRODUCT.md's UI Principle, a failed automation is exactly the kind of "this happened because Rule X matched" (or in this case, *didn't* successfully complete) moment that must be inspectable by the end user, not just by support staff.

---

## 14. Rule Versioning, Testing, Simulation, and Debugging

### 14.1 Rule Versioning

- Every save creates an immutable version snapshot (building on `DATABASE.md`'s `rules.version` optimistic-locking column, Section 9 of that document) - not just a conflict-detection number, but a real history: every past version of a rule's trigger/conditions/actions is retrievable and diffable.
- **Draft / Published / Archived lifecycle**: a rule can be edited as a draft (tested via Section 14.2-14.3 without affecting production behavior) before being published (becomes the live, matching version) - editing a *published* rule creates a new draft version rather than mutating live behavior mid-edit, so an in-progress edit can never partially apply to a real incoming message.
- **Rollback**: reverting to a prior version is a first-class action, not a manual reconstruction - directly serving the "never lose configuration" trust principle this whole documentation set has maintained since PRODUCT.md.

### 14.2 Rule Testing

- Every rule can carry a **regression test suite**: a set of saved synthetic or real (redacted) sample events with expected outcomes ("given this message, this rule should match and these actions should fire with these parameter values") - run automatically on every edit before a draft can be published, catching a rule broken by a well-intentioned tweak before it goes live.
- This extends `API.md` Section 10.6's single `test-runs` dry-run endpoint into a persisted, re-runnable suite - the difference between "did this work once when I checked" and "does this still work after every future change," the same distinction that makes automated tests valuable over manual QA anywhere else in software.

### 14.3 Rule Simulator

The most technically differentiating tool in this section: a **time-travel-capable sandbox**. A user can feed the simulator a sequence of synthetic events across simulated time ("a message arrives now; fast-forward 3 days with no reply; a second message arrives") and watch exactly which triggers fire, which conditions evaluate true/false at each step, and which actions would run - without waiting three real days, and without touching any real conversation or sending any real message.

**Why this matters disproportionately for this product specifically**: PRODUCT.md's most valuable automation examples are time-based ("no reply after 2 days," "remind me if silent hours end and nothing was handled") - these are exactly the rules a user has the least confidence in without testing, because verifying them the honest way means waiting the real duration. The simulator collapses that feedback loop from days to seconds. **This requires the engine's scheduling abstraction (Section 3.3's durable `ScheduledJob` design) to be replayable against a virtual clock** - a capability a generic automation tool wired to real webhooks structurally cannot offer, because it doesn't own the scheduling layer end-to-end the way this engine does.

### 14.4 Rule Debugger

For a real (non-simulated) execution, past or dead-lettered: a step-by-step trace view showing the exact Context Object snapshot at execution start, each condition node's evaluated boolean result (with the resolved variable values that produced it), which branch of the condition tree was taken, and each action's parameters (post-variable-interpolation), result, and timing. This is the direct realization of PRODUCT.md's "this happened because Rule X matched" UI Principle, and it is what `DATABASE.md`'s `rule_execution_logs.actions_executed` jsonb column and Section 10's context-snapshot-determinism were specifically designed to make possible.

---

## 15. Rule Analytics

- **Per-rule metrics**: match rate (how often the trigger fires vs. how often conditions actually pass), action success rate, average execution latency, DLQ rate.
- **"Value delivered" framing, not just technical metrics**: surfacing something closer to "this rule has flagged 14 messages as urgent that you replied to within 10 minutes" or "this rule has prevented 6 stale leads from going unanswered" - translating engine-level telemetry into the same language as PRODUCT.md's Success Metrics ("missed message incidence rate trending down"), so a user's trust in automation compounds from evidence, not just faith.
- **Workspace-level automation health dashboard** (Business tier, extending `API.md` Section 10.10-adjacent capabilities): total active rules, rules with recent failures, rules that haven't matched anything in 30+ days (a candidate for archiving, directly implementing PRODUCT.md automation example #96), and a view of which snippets/composite actions are most reused across the workspace's rules.
- **Never a vanity metric substitute for reliability**: analytics surfaces failure/staleness signals as prominently as success signals - a dashboard that only shows "rules fired: 1,204" without also surfacing "rules that silently stopped matching anything" would violate this whole document's inspectability principle.

---

## 16. Rule Marketplace

Formalizes PRODUCT.md's Viral Features (shareable rule templates) and ROADMAP.md Phase 18 into a real design, built on the three-tier reusability model from Sections 4.4/5.3:

- **What's published**: Condition Snippets, Composite Actions, and full Rules/Rule Bundles (a curated set of related rules, e.g. a "Support Team Starter Pack") - three distinct, independently useful artifact types, not just "rules."
- **Portability via Variables (Section 4.3)**: a published template never hardcodes a workspace-specific contact ID, tag ID, or webhook URL - it references named Workspace Variables, and importing a template walks the user through mapping those variables to their own workspace's actual contacts/tags/values (e.g. "this template references `{{vars.manager_contact}}` - who is that for you?"). This is what makes a template genuinely reusable across workspaces rather than a broken reference the moment it's imported.
- **Safety review before publication**, per `SECURITY.md` Section 9.5's connector-marketplace review gate applied here too: a published rule/action that includes a webhook call or references external systems goes through an automated + spot-checked review before it's discoverable - a malicious "helpful automation template" that quietly exfiltrates message content to a third-party URL is a realistic abuse vector for exactly this kind of marketplace, and the review gate exists specifically to catch it, not as generic quality control.
- **Attribution, ratings, and install counts**: standard marketplace mechanics (PRODUCT.md's Monetization section already anticipates a revenue-share model here) - version-independent from the importer's own copy (importing a template creates the importer's own editable Rule, per Section 14.1's versioning; updates to the published template don't silently mutate rules already imported by others, matching `API.md` Section 3's "no silent breaking changes" philosophy applied to marketplace content).
- **SEO/growth surface**: public, unauthenticated template pages (per PRODUCT.md's Growth Strategy - "each recipe page is a soft product demo") are a first-class product surface, not an afterthought bolted onto an otherwise-private feature.

## 17. Rule Import/Export

- **Portable format**: a versioned, human-readable JSON representation of a rule (or snippet/composite action/bundle) - workspace-specific IDs (contact IDs, tag IDs) are exported as named references (mirroring Section 16's Variable-based portability), not raw UUIDs, so an exported rule is genuinely inspectable and diffable in a text editor or version control system, appealing directly to PRODUCT.md's Power User persona.
- **Round-trip guarantee**: export → import on the same workspace reproduces an identical rule, byte-for-byte in structure - the format is the same one the marketplace (Section 16) and the visual builder's "save" operation both use internally, not a lossy secondary serialization invented just for export.
- **API and CLI paths**: exposed via `API.md`'s REST surface (a natural additive endpoint under the existing `/v1/rules` group) for programmatic use - the Power User persona's expectation of scriptability, and the mechanism a future `smc` CLI tool (not yet scoped, flagged here for later) would build on.
- **Bulk export for backup/migration**: a full workspace's rule set exportable as one archive - directly relevant to `DATABASE.md` Section 19's tenant-to-region migration scenario and to GDPR data portability (`SECURITY.md` Section 7.2) where rules are considered part of a user's exportable data.

---

## 18. Why Competitors Will Struggle to Copy This

Stated explicitly, not left implicit, because this document's stated purpose is to be the thing that makes the product famous:

1. **IdentityGraph is the actual product.** Sections 4.2 and 6 depend entirely on the canonical, cross-channel, relationship-aware identity resolution layer named and formalized in `ARCHITECTURE.md` Section 13 ([ADR-0012](adr/0012-identitygraph-canonical-identity-layer.md)), persisted per `DATABASE.md` Section 6.6. A competitor can clone the visual builder's UI in days. They cannot clone `sender.isVip` meaning the same thing whether the sender messaged via Telegram or Slack without first doing the multi-year work of unifying identity across providers the way IdentityGraph does - and doing it in a way that respects every provider's ToS (ADR-0010's discipline), which rules out the shortcuts some competitors (Beeper's bridging history) have taken.
2. **The simulator (Section 14.3) requires owning the scheduling layer end-to-end.** A tool built as a thin layer over third-party webhooks has no virtual clock to fast-forward, because it doesn't own the "wait 2 days" primitive - we do, durably, in Postgres (`DATABASE.md` Section 6.13), specifically so it can be replayed.
3. **Three-tier reusability (snippets, composite actions, rules/bundles) compounds.** A flat "here are 200 templates" competitor offering is a fixed catalog. This engine's combinatorial structure means the *marketplace itself* grows in expressive power as users publish snippets and composite actions others recombine in ways the original author never anticipated - a network effect a flat template gallery cannot replicate.
4. **Inspectability (debugger, analytics, DLQ) is a trust product, not just a dev tool.** Competitors treat automation reliability as an engineering concern hidden from the user. This document treats it as a user-facing trust surface (Section 14.4, Section 15) because PRODUCT.md's entire thesis is that people won't delegate something as consequential as message handling to a system they can't verify - building that verification layer well is itself defensible product work, not just plumbing.
5. **It never asks the user to trust AI to get there.** Every capability in this document (visual builder, testing, simulation, versioning, marketplace) works completely without AI, per Section 9's hard boundary. Competitors racing to make automation "AI-native" are building on a foundation that breaks the moment a model is wrong, slow, or unavailable; this engine's floor is a fully deterministic, fully inspectable system that AI only ever assists, never replaces.

---

## 19. 208 Real-World Automation Examples

Grouped by persona/domain, matching the brief's 16 categories, 13 per category. Format: `IF <trigger/condition> THEN <action>`, using the primitives, snippets, and composite-action concepts defined above rather than restating PRODUCT.md's original 100 verbatim - these are additional, more specific, persona-grounded examples the engine's compositional model is built to express.

### Personal (1-13)
1. IF a message from a contact tagged "Best Friend" arrives THEN break through silent hours with a distinct sound.
2. IF I haven't replied to a non-VIP DM in 5 days THEN quietly archive it into a "Someday" folder instead of leaving it cluttering the inbox.
3. IF a message contains a phone number I don't recognize AND the sender is unknown THEN flag it as "possible spam" before it reaches my main feed.
4. IF a birthday reminder fires (calendar-integrated) THEN draft a birthday message using my "Birthday Template" snippet for one-tap send.
5. IF a group chat I muted gets a direct @mention of me THEN notify me anyway, overriding the mute.
6. IF I open a conversation I snoozed and the snooze reason was "waiting for the weekend" AND today is Saturday THEN unsnooze automatically.
7. IF a message contains a shared location pin THEN save it to a "Places to Visit" tag automatically.
8. IF I mark a contact as "Ex" THEN auto-archive future messages from them without notification, silently.
9. IF a voice note longer than 2 minutes arrives from a non-VIP THEN transcribe it (AI-optional) instead of notifying me to listen live.
10. IF I send "on my way" to a contact THEN start a location-share composite action (future, location-aware) for 30 minutes.
11. IF a contact I haven't spoken to in 6+ months messages me THEN show their relationship timeline inline so I have context before replying.
12. IF a package delivery notification arrives (courier-tagged sender) THEN add it to a "Deliveries Today" digest instead of an individual ping.
13. IF I send the same reply 3+ times in a month to different people THEN suggest turning it into a Saved Reply snippet.

### Business (14-26)
14. IF a message arrives from a domain matching a signed client THEN auto-tag with that client's name and route to the account owner.
15. IF a proposal PDF is sent AND no reply arrives in 5 business days THEN remind the sender and CC their manager.
16. IF a contract-tagged attachment is received THEN forward a copy to the legal workspace variable email automatically.
17. IF a vendor's invoice total exceeds a configured threshold THEN require manual approval before the "auto-forward to Finance" composite action runs.
18. IF a client conversation goes stale for 10 days AND the client is tagged "At Risk" THEN escalate to the account manager immediately.
19. IF a new business inquiry arrives outside business hours THEN auto-reply with expected response time and log it for morning triage.
20. IF two team members reply to the same client thread within 5 minutes of each other THEN flag a possible double-response for review.
21. IF a partner sends a message tagged "Renewal" within 30 days of the renewal date THEN prioritize it above the normal inbox order.
22. IF a message is flagged by AI as containing a verbal commitment ("I'll send that Friday") THEN create a tracked Commitment automatically.
23. IF a client's sentiment score drops sharply across two consecutive messages THEN alert the account owner before the next reply is sent.
24. IF an NDA-tagged document is shared in a conversation THEN restrict that conversation's export/sharing permissions automatically.
25. IF a workspace member is marked out-of-office THEN reassign their tagged "Client" conversations to a designated backup.
26. IF a competitor's name is mentioned by a client THEN tag the conversation "Competitive Intel" and notify the founder.

### Sales (27-39)
27. IF a lead replies with pricing questions THEN move them to the "Qualified" pipeline stage and notify the assigned rep.
28. IF a deal tagged "Closing This Month" has no activity in 3 days THEN escalate a reminder with the deal value included in the notification.
29. IF a prospect opens a shared proposal link (webhook-integrated) THEN notify the rep in real time so they can follow up while it's top of mind.
30. IF a lead goes cold (no reply 14 days) AND is tagged "High Value" THEN route to a re-engagement sequence composite action.
31. IF a prospect mentions a specific competitor by name THEN attach the relevant battlecard snippet to the conversation for the rep.
32. IF a deal is marked "Closed Won" THEN auto-tag the contact "Customer" and trigger the onboarding handoff bundle.
33. IF a lead's company matches an existing customer's domain THEN flag a possible duplicate/expansion opportunity instead of treating it as new.
34. IF a rep sends 3+ follow-ups with no reply THEN suggest pausing outreach and marking the lead "Cooling" rather than continuing indefinitely.
35. IF an inbound lead messages after hours from a timezone where it's business hours locally THEN prioritize it above same-timezone after-hours messages.
36. IF a proposal is sent and the recipient forwards it to a new, previously-unseen contact THEN flag a "new stakeholder detected" notification.
37. IF a lead's reply contains budget language ("we have $X allocated") THEN auto-tag "Budget Confirmed" and boost priority score.
38. IF a quota-relevant deal has its close date pushed twice in one month THEN alert the sales manager, not just the rep.
39. IF a referral contact messages ("so-and-so said I should reach out") THEN auto-tag "Referral" and route to the top-performing rep.

### Support (40-52)
40. IF a support message contains "refund" or "cancel" THEN route to the Retention queue with elevated priority.
41. IF a customer's message sentiment is detected as angry AND their plan tier is Enterprise THEN escalate directly to a senior agent, skipping the normal queue.
42. IF a ticket is reassigned 3+ times THEN flag it for manager review automatically.
43. IF a customer references a ticket number that doesn't exist in the system THEN auto-reply asking for clarification instead of routing blindly.
44. IF the same customer opens 3 tickets in 24 hours THEN merge them into one thread and notify the assigned agent of the pattern.
45. IF a resolved ticket gets a new reply within 48 hours THEN reopen it automatically instead of treating it as a new conversation.
46. IF an agent is about to close a ticket where the customer's last message contained a question THEN block the close and prompt a confirmation.
47. IF a customer's response time to agent replies is unusually fast (multiple replies within seconds) THEN flag a possible bot/automated account.
48. IF a ticket sits unassigned for 15 minutes during business hours THEN auto-assign to the agent with the lowest current open-ticket count.
49. IF a customer explicitly asks for a manager THEN escalate immediately regardless of ticket priority score.
50. IF a support conversation includes a screenshot with visible error text THEN OCR-extract it (AI-optional) and attach as searchable text for the agent.
51. IF the same bug is reported by 5+ distinct customers within a week THEN auto-create a summary digest for the engineering team.
52. IF a customer's subscription is cancelled while a support ticket is still open THEN flag it for special handling instead of auto-closing.

### HR (53-65)
53. IF a candidate accepts an interview invite THEN auto-send prep materials and add the interview to the recruiter's tracked pipeline.
54. IF a candidate goes silent for 5 days after an offer is sent THEN remind the recruiter with the offer's expiration date visible.
55. IF a new hire's start date is 3 days away THEN trigger the onboarding-message composite action automatically.
56. IF an employee sends a message containing "resign" or "two weeks notice" THEN privately alert HR without notifying the employee's manager automatically.
57. IF a candidate references a competing offer THEN flag "Urgent - competing offer" and notify the hiring manager same-day.
58. IF an internal complaint or HR-sensitive keyword is detected in an employee message THEN route to HR confidentially, bypassing normal team visibility.
59. IF a scheduled 1:1 conversation thread has no activity in 2 weeks THEN nudge the manager to check in.
60. IF a candidate's interview feedback from all interviewers is submitted THEN auto-compile a summary for the hiring decision meeting.
61. IF an employee's work anniversary is this week THEN remind their manager with a suggested recognition message.
62. IF a rejected candidate replies asking for feedback THEN suggest the recruiter's saved feedback-template snippet.
63. IF a reference-check contact hasn't replied in 4 days THEN send a polite follow-up automatically.
64. IF a new employee hasn't completed onboarding paperwork by day 3 THEN escalate a reminder to both the employee and HR.
65. IF an internal job posting gets an internal applicant THEN notify both the applicant's current manager and the hiring manager per policy.

### Developers (66-78)
66. IF a message in a Discord community mentions a known error string from our own error-tracking integration THEN auto-tag "Bug Report."
67. IF a Slack message references a PR link THEN attach the PR's current CI status as context (webhook-integrated) automatically.
68. IF an on-call escalation message arrives outside working hours THEN override silent mode regardless of VIP status - on-call always breaks through.
69. IF a message in an open-source community channel goes unanswered for 48 hours AND is tagged "Question" THEN surface it in a maintainer digest.
70. IF a message contains a stack trace THEN auto-format it as code and suggest a "looks like [known library]" tag based on pattern matching.
71. IF a deploy-notification webhook fires and the deploy failed THEN notify the responsible engineer directly, not the whole channel.
72. IF a contributor's first-ever PR-related message arrives THEN send a welcome template and tag them "First-Time Contributor."
73. IF a security-sensitive keyword ("CVE," "vulnerability," "exploit") appears in any channel THEN route privately to the security team regardless of the original channel's visibility.
74. IF a message thread about an incident has no update in 30 minutes during an active incident THEN remind the incident commander to post a status update.
75. IF a dependency-update bot message reports a critical vulnerability THEN escalate above routine bot-message noise automatically.
76. IF a teammate asks "can someone review this?" and no reaction/reply follows in 4 working hours THEN nudge a second reviewer.
77. IF a message references an internal API endpoint that's deprecated (per a maintained list) THEN auto-reply with the replacement endpoint.
78. IF an incident channel is created (event trigger from an incident-management webhook) THEN auto-mute unrelated non-VIP notifications for the incident commander until resolved.

### Founders (79-91)
79. IF an investor sends a message THEN always override silent hours, regardless of time of day.
80. IF a fundraising-tagged conversation has no reply from us in 24 hours THEN escalate a reminder above all other pending items.
81. IF a message mentions "term sheet" or "valuation" THEN tag "Fundraising-Sensitive" and restrict visibility to founders only.
82. IF a board member messages during a board meeting week THEN prioritize above the normal inbox regardless of VIP tier ranking.
83. IF a press/journalist-domain sender messages THEN route to the designated PR contact and notify the founder simultaneously.
84. IF a key employee's message sentiment trends negative across a week of 1:1 check-ins THEN privately flag it for the founder, not the team.
85. IF a customer conversation mentions "considering leaving" THEN escalate directly to the founder for high-value accounts.
86. IF a co-founder is unreachable for 24+ hours during an active fundraising process THEN trigger an emergency-contact composite action.
87. IF a legal document requiring signature is shared THEN track it as a blocking Commitment with a visible countdown until signed.
88. IF an advisor sends unsolicited advice on a topic tagged "Not Currently Relevant" THEN file it for later review instead of interrupting focus time.
89. IF a potential acquirer or strategic partner's domain messages for the first time THEN flag as "High Priority - New Strategic Contact."
90. IF weekly investor updates haven't been sent by the scheduled day THEN remind the founder with a pre-filled draft based on the prior month's template.
91. IF a hiring decision thread stalls for 5+ days on a role marked "Urgent" THEN escalate to the founder directly.

### Students (92-104)
92. IF a professor's message arrives THEN always notify, even during a "study focus" silent mode.
93. IF a group project chat mentions a deadline within 48 hours THEN pin the message and remind all members once per day until the deadline passes.
94. IF a university financial-aid or registrar email arrives THEN elevate priority above class-related group chats.
95. IF a classmate asks a question I already answered earlier in the same thread THEN suggest my earlier answer instead of requiring a fresh reply.
96. IF a job/internship-application-tracked contact replies THEN move it above regular social notifications automatically.
97. IF a study group chat has been silent for a week before an exam-tagged deadline THEN nudge the group with a reminder.
98. IF a scholarship or grant deadline is 7 days away (calendar-integrated) THEN send a self-reminder and surface any related unanswered messages.
99. IF a message from an unknown sender contains "free money" or classic scam phrasing THEN auto-flag as likely scam before it's even opened.
100. IF a roommate group chat mentions "rent due" THEN tag it "Household-Finance" and pin above general chatter.
101. IF a thesis/advisor-tagged contact hasn't replied in 5 days THEN remind me to follow up before I forget entirely.
102. IF I'm tagged in a class group chat during a scheduled "class in session" time block THEN delay the notification until the block ends.
103. IF an internship offer deadline is within 48 hours and I haven't responded THEN escalate above every other notification, unconditionally.
104. IF a club/organization broadcast channel posts more than 5 messages in an hour THEN digest them into one summary instead of individual pings.

### Healthcare (105-117)
105. IF a message from a patient's care coordinator arrives THEN always notify immediately, treated as VIP by default for clinical staff workspaces.
106. IF a message contains a medication name and a dosage-change keyword THEN flag for pharmacist/clinician review before any auto-reply fires.
107. IF an appointment-reminder message goes unconfirmed 24 hours before the appointment THEN escalate a follow-up call task to front-desk staff.
108. IF a patient message contains urgent symptom keywords (defined clinically, not guessed generically) THEN bypass all queueing and route to on-call staff instantly.
109. IF a lab-result notification arrives and the result is flagged abnormal (integration-provided) THEN prioritize above routine results automatically.
110. IF a patient hasn't responded to a follow-up care message in 3 days post-procedure THEN trigger a check-in reminder to clinical staff.
111. IF a message references PII/PHI patterns THEN auto-tag "Contains PHI" for compliance visibility and restrict export permissions on that conversation.
112. IF a prescription-refill request arrives THEN route to the appropriate provider's queue and auto-confirm receipt to the patient.
113. IF a referral message to a specialist goes unacknowledged for 48 hours THEN escalate to the referring provider's admin staff.
114. IF an insurance-authorization message is received THEN tag "Billing" and route to the billing team automatically.
115. IF a patient message is flagged by AI sentiment as distressed THEN escalate to a human immediately - no automated response is ever sent in this case.
116. IF a care-team internal handoff message lacks a required field (per a configured checklist) THEN flag it incomplete before the shift change completes.
117. IF a telehealth appointment link goes unclicked 10 minutes before the scheduled time THEN send a reminder with the link re-sent.

### Finance (118-130)
118. IF an invoice is sent and payment isn't confirmed within the payment terms window THEN escalate a reminder, CC'ing the account owner.
119. IF a message contains a wire-transfer request from an unfamiliar sender claiming to be an executive THEN flag as likely fraud before any action is taken - never auto-approve financial requests via message.
120. IF a vendor payment confirmation is received THEN auto-tag "Paid" and update the linked invoice's tracked status.
121. IF an expense-report submission exceeds a configured threshold THEN require manager approval before the auto-forward-to-Finance action runs.
122. IF a client disputes a charge in a message THEN route to Billing with the original invoice attached automatically for context.
123. IF a recurring subscription renewal notice arrives 30 days before the charge THEN remind the budget owner with the amount and renewal date.
124. IF a message references a specific account number pattern THEN mask it in any AI-generated summary while keeping the original message intact.
125. IF month-end approaches (scheduled trigger) AND unpaid invoices remain THEN compile a digest of all outstanding items for the finance lead.
126. IF a bank or payment-provider security alert message arrives THEN treat as maximum priority, overriding silent hours unconditionally.
127. IF a contractor's invoice doesn't match their signed rate on file THEN flag for manual review instead of auto-approving.
128. IF a tax-document-tagged attachment is received THEN route to the designated accountant contact automatically.
129. IF a budget threshold is crossed for a tagged category (e.g. "Marketing Spend") THEN alert the budget owner in real time.
130. IF a currency-mismatch is detected between an invoice and the expected payment currency THEN flag for review before processing.

### Operations (131-143)
131. IF a supplier message reports a shipment delay THEN notify the ops lead and auto-tag the affected orders "At Risk."
132. IF an inventory-threshold alert (integration webhook) fires THEN notify procurement and auto-draft a reorder message to the supplier.
133. IF a facilities-related message contains "broken" or "not working" THEN route to the facilities queue with elevated priority.
134. IF a vendor SLA-breach condition is met (e.g. response time exceeded per contract) THEN auto-flag the vendor conversation for contract review.
135. IF a recurring operational check-in (scheduled trigger, weekly) finds no update from a process owner THEN escalate to their manager.
136. IF a compliance-audit-tagged document request goes unanswered for 3 days THEN escalate above routine operational messages.
137. IF a critical vendor's LinkedAccount connection needs reauthorization THEN alert ops immediately - this connector likely carries business-critical order flow.
138. IF a shift-handoff message is incomplete (missing a required field per checklist) THEN flag it before the next shift begins.
139. IF a safety-incident keyword is detected in any operational channel THEN escalate immediately, bypassing all queueing and priority scoring.
140. IF a process runs past its documented SLA (time-based trigger tied to a tagged conversation) THEN notify the process owner and their manager simultaneously.
141. IF a new supplier's first invoice differs significantly from the quoted price THEN flag for manual reconciliation before payment processing.
142. IF equipment-maintenance reminders (scheduled trigger) come due THEN notify the responsible technician with the equipment's message history attached.
143. IF a customer-facing outage is reported by 3+ independent contacts within 15 minutes THEN auto-escalate as a probable systemic issue, not isolated reports.

### Travel (144-156)
144. IF a flight-confirmation message arrives THEN auto-extract the itinerary and create a scheduled reminder 3 hours before departure.
145. IF a flight-delay/cancellation notification is received THEN immediately notify all trip-linked contacts (e.g. whoever's picking me up).
146. IF I'm traveling (calendar/location-integrated, future) and a message arrives outside my new local silent hours THEN suppress it correctly for the new timezone, not the home one.
147. IF a hotel booking confirmation is received THEN tag it "Travel" and link it to the same trip as the flight confirmation automatically.
148. IF a message from a local contact arrives while I'm in their city (location-aware, future) THEN elevate its priority above the normal baseline.
149. IF a visa or travel-document deadline is 14 days away THEN remind me with the document requirements attached.
150. IF a work message arrives while my calendar shows "Out of Office - Travel" THEN auto-reply with expected response delay and queue it for return.
151. IF a currency-exchange or international-transaction alert arrives during a trip THEN treat as expected, not flagged as anomalous (context-aware suppression of a false-positive fraud alert).
152. IF a travel companion's message mentions a changed meeting point THEN highlight it above other trip-chat messages as time-sensitive.
153. IF a rental car or accommodation checkout reminder is due THEN surface it the evening before, not the morning of.
154. IF a trip-related expense message (receipt photo) arrives THEN auto-tag "Travel Expense" and route to the expense-report composite action.
155. IF a language-mismatch is detected in a message while traveling internationally THEN offer inline translation automatically (AI-optional).
156. IF an emergency-contact message arrives while traveling THEN always override silent hours and local-time suppression, unconditionally.

### Family (157-169)
157. IF a message from a parent contains "call me" THEN override silent mode immediately, no exceptions.
158. IF a child's school sends an emergency-alert-tagged message THEN treat as maximum priority regardless of any other setting.
159. IF a family group chat mentions a shared event date THEN auto-add a reminder visible to all automation-enabled members (where supported).
160. IF a co-parent's message concerns a schedule change THEN prioritize above general family chat noise and flag "Needs Confirmation."
161. IF an elderly relative's regular check-in message doesn't arrive by its usual time (pattern-based, via `conversation.responseLagIsAbnormal`) THEN prompt me to check in proactively.
162. IF a family medical appointment reminder arrives THEN cross-reference with the calendar and flag any conflict immediately.
163. IF a babysitter/childcare contact messages during work hours THEN treat as VIP-tier priority regardless of general work-focus mode.
164. IF a shared household chat mentions "out of" (milk, medicine, etc.) THEN tag it "Household - Needed" for the next shopping trip.
165. IF a family member shares a location pin during an agreed check-in window THEN acknowledge automatically so they know it was seen.
166. IF a sibling group chat goes silent around a known family member's difficult anniversary date THEN gently surface a reminder to reach out, privately, to me only.
167. IF a message from a family member contains financial-distress language THEN flag privately for me, never auto-forwarded to anyone else.
168. IF a pet-sitter or dog-walker contact sends an update photo THEN auto-file it into a "Pet Updates" collection instead of the main feed.
169. IF a holiday-planning group chat has unresolved decisions 2 weeks before the date THEN nudge the group with the specific open questions.

### Productivity (170-182)
170. IF I mark a message "Needs 15 Minutes" THEN auto-schedule a Waiting-On follow-up if I haven't acted within a day.
171. IF my inbox's "Needs You" count exceeds a self-configured threshold THEN suggest entering Focus Mode rather than continuing to be interrupted.
172. IF a message thread has more than 20 unread messages THEN offer an AI-optional summary instead of requiring a full manual read-through.
173. IF I complete a task referenced in a message (integration-linked to a task manager) THEN auto-reply to the original sender that it's done.
174. IF the Morning Briefing has been unopened by 11am THEN send a gentle secondary nudge, once, not repeatedly.
175. IF I snooze the same conversation 3+ times in a row THEN suggest either committing to a real reply time or archiving it.
176. IF a message requires a yes/no decision (structurally detected) THEN surface it with inline Quick Action buttons instead of requiring me to open it.
177. IF my weekly "unresolved asks" count trends upward for 2 consecutive weeks THEN surface a proactive digest suggesting a catch-up block.
178. IF a recurring weekly report message is due (scheduled trigger) and the data source hasn't updated THEN delay sending and notify me instead of sending stale data.
179. IF two messages from different contacts propose meeting at the same time THEN flag the conflict before I accidentally double-book by replying to both.
180. IF I archive a conversation and then reference it again within a week THEN suggest un-archiving it for easier access.
181. IF a rule I built hasn't matched anything in 60 days THEN prompt me to review or archive it (extending Section 15's staleness signal to direct user action).
182. IF I'm in Focus Mode and a non-VIP sender messages 3+ times in quick succession THEN queue a single combined notification for after Focus Mode ends, not three separate ones.

### Security (183-195)
183. IF a message requests credentials, passwords, or payment info THEN flag as likely phishing regardless of apparent sender identity.
184. IF a sender's display name matches a known contact but their underlying account ID doesn't THEN flag "possible impersonation" before the message is trusted.
185. IF a new device logs into a linked messaging account THEN notify me immediately through a separate, unaffected channel.
186. IF a message contains a shortened/obfuscated link from an unknown sender THEN warn before allowing a tap-through, rather than silently trusting it.
187. IF an automation rule would auto-forward a message containing detected PII THEN require explicit one-time confirmation before that rule can be activated.
188. IF a LinkedAccount's OAuth token is externally revoked THEN pause every rule depending on that account gracefully and notify me, rather than let them fail silently.
189. IF message volume from a single contact spikes abnormally within an hour THEN flag "possible compromised account" for that contact.
190. IF a webhook action target URL resolves to an internal/private IP range THEN block the action outright as a likely SSRF attempt, regardless of who configured it.
191. IF a rule references a workspace variable that no longer exists (e.g. a deleted contact) THEN disable that rule and alert the owner instead of failing unpredictably.
192. IF an API key hasn't been used in 90+ days THEN suggest revoking it as a hygiene measure.
193. IF a message from a "verified" business account suddenly starts requesting unusual actions (e.g. urgent payment) THEN flag the behavioral change as suspicious regardless of the account's prior trust level.
194. IF a workspace admin role is granted to a new member THEN notify all existing admins as a transparency measure.
195. IF a rule's action chain is edited to add a webhook call for the first time THEN require the editor to explicitly confirm they understand data will leave the workspace.

### Accessibility (196-208)
196. IF a voice message is received THEN auto-generate a text transcript by default for users who've enabled screen-reader-first mode, not as an opt-in afterthought.
197. IF an image is shared with no caption THEN generate an AI-optional alt-text description automatically for visually-impaired users.
198. IF a message contains dense, jargon-heavy text THEN offer an optional plain-language rewrite (AI-optional, never replacing the original).
199. IF a user has enabled reduced-notification mode (e.g. for sensory sensitivity) THEN batch all non-VIP notifications into scheduled digest windows instead of real-time interruptions.
200. IF a message arrives in a language different from the user's set primary language THEN offer inline translation with the original always visible alongside it.
201. IF a user relies on switch-access or voice-control input THEN ensure every Quick Action button (Section 5/PRODUCT.md) is reachable via a single, consistent activation pattern, never requiring precise multi-step gestures.
202. IF a message thread becomes very long THEN offer a structured, sectioned summary (AI-optional) rather than requiring linear scroll-based reading for users for whom that's a barrier.
203. IF a user has color-vision-deficiency mode enabled THEN ensure priority/VIP visual indicators never rely on color alone - always paired with an icon or text label.
204. IF a video message is received THEN offer auto-captioning (AI-optional) for deaf/hard-of-hearing users by default when accessibility mode is enabled.
205. IF a user's automation rules reference time-based silence windows THEN ensure the visual builder's time-picker is fully operable via keyboard alone, no mouse-only interaction paths.
206. IF a notification would normally rely on sound only (e.g. an emergency override) THEN also trigger a visual/haptic equivalent simultaneously, never sound-only for anything marked urgent.
207. IF a user's cognitive-load-reduction mode is enabled THEN automatically simplify the rule builder's default view to hide advanced nested-condition options unless explicitly expanded.
208. IF a screen-reader user builds a rule THEN ensure the live plain-language preview (Section 7) is the primary way the rule's meaning is confirmed, since a purely visual canvas representation is not sufficient on its own.

---

## Coverage Map

| Requirement | Section |
|---|---|
| Visual rule builder | 7 |
| Natural language rule creation | 8 |
| Rule templates | 16 |
| Nested conditions | 4.1 |
| Variables | 4.3 |
| Context awareness | 6 |
| Time-based triggers | 3.1, 3.3 |
| Location-aware triggers (future) | 3.1, 3.9 references throughout |
| AI-assisted rules (optional) | 9 |
| Manual triggers | 3.1 |
| Event triggers | 3.1 |
| Scheduled triggers | 3.1, 3.3 |
| Message triggers | 3.1 |
| Contact triggers | 3.1 |
| Workspace triggers | 3.1 |
| Trigger model | 3 |
| Condition model | 4 |
| Action model | 5 |
| Execution engine | 10 |
| Retry policy | 11 |
| Failure policy | 12 |
| Dead letter queue | 13 |
| Rule versioning | 14.1 |
| Rule testing | 14.2 |
| Rule simulator | 14.3 |
| Rule debugger | 14.4 |
| Rule analytics | 15 |
| Rule marketplace | 16 |
| Rule import/export | 17 |
| 200+ real-world examples, grouped | 19 (208 examples, 16 categories) |
| Designed as a platform | 2, 3.4, 5.1, 7, 18 |
| Why competitors struggle to copy it | 1, 18 |
