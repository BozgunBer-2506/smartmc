# 0013 - Identity Merge Governance: Safe Merge and Reversal Over Matching Cleverness

- Status: Accepted
- Date: 2026-07-18
- Deciders: Founder/CTO
- Related: [ADR-0012](0012-identitygraph-canonical-identity-layer.md), [ARCHITECTURE.md](../ARCHITECTURE.md) Section 13, [DATABASE.md](../DATABASE.md) Section 6.6, [UI_GUIDE.md](../UI_GUIDE.md) Section 7

## Context

ADR-0012 established that IdentityGraph never auto-merges beyond an exact deterministic match, and that every fuzzy/cross-provider match requires human confirmation. What that ADR left underspecified is *how* a candidate match is held, reviewed, and acted on - and, more importantly, what happens when a confirmed merge turns out to be wrong.

The concrete failure mode: a workspace has two genuinely different real people who happen to share the same first name and a plausible signal overlap - e.g. "Ahmet" the customer and "Ahmet" the personal friend, both messaging through channels that expose only a first name and no strongly distinguishing identifier. If these two `Contact` records are merged - even with high confidence, even with a human clicking "confirm" too quickly - the damage cascades immediately and silently: the customer's VIP status (or lack of it) now applies to messages from the friend and vice versa; every automation rule targeting either "Ahmet" now fires against both people's messages; any AI-generated summary or suggested reply now draws on a blended, incorrect relationship history. This is not a cosmetic bug - it is exactly the kind of "did I trust the wrong thing" incident that PRODUCT.md's entire premise depends on never happening, and it is worse than IdentityGraph simply failing to resolve someone correctly, because a wrong merge is *confidently* wrong, not visibly uncertain.

This means the actual product priority for IdentityGraph is not "how good is the matching algorithm" - it's "how cheap and safe is it to notice and undo a mistake." A system with mediocre matching but instant, obvious, fully-auditable recovery is a better product than one with excellent matching and no clean way back.

## Decision

1. **A candidate identity match is a persisted, reviewable object with its own lifecycle** (`identity_merge_suggestions`, `DATABASE.md` Section 6.6), not an ephemeral event that's lost if a user doesn't act on it immediately. States: `pending` → `approved` (becomes a real merge, logged in `identity_merge_log`) / `rejected` (logged, and the same candidate pair is not re-suggested unless new distinguishing signal appears) / `expired` (per ADR-0012's anti-fatigue rate limiting).
2. **Every merge is reversible via an explicit split operation** (`ARCHITECTURE.md` Section 13.3, `identity_split_log`) that is a first-class, equally-supported action - not a support-ticket-only emergency recovery path, but a standard action any workspace member with appropriate permission can take directly from the Person screen (`UI_GUIDE.md` Section 7).
3. **Design and engineering prioritization is explicit**: when matching sophistication and merge safety trade off against each other (e.g. a more aggressive fuzzy-matching heuristic that would catch more true duplicates but also raise the false-positive rate), **safety wins by default**. A missed duplicate-detection opportunity (two records that should be one but aren't yet) is a minor, low-cost inconvenience, correctable any time by a manual merge. A wrong merge is a high-cost, actively-damaging event until it's caught and split. These two error types are not symmetric, and IdentityGraph's design must not treat them as if they were.
4. **Every review action is attributed and audited**: `identity_merge_suggestions.reviewed_by_user_id`/`reviewed_at` for both approvals and rejections - a rejected suggestion is exactly as informative a record as an approved one, since a repeatedly-rejected candidate pair is itself a signal the matching heuristic should weigh down for that workspace.

## Consequences

- `DATABASE.md` gains the `identity_merge_suggestions` table (Section 6.6), giving the pending-review queue `UI_GUIDE.md` Section 7's Person screen already assumed a real, durable backing store instead of an event that only exists in the moment it fires.
- `ARCHITECTURE.md` Section 13 is extended with a concept glossary (mapping identity entity / provider identity / confidence score / merge request / split operation / approval flow / identity history / privacy controls / data ownership / wrong-merge recovery to their exact locations) and a worked example (the "two Ahmets" scenario) making the cascading-damage argument concrete rather than abstract.
- This does not change ADR-0012's core governance rule (never auto-merge beyond exact match) - it specifies the mechanism that rule operates through, and states explicitly, as a decision worth recording on its own, that safety and reversibility - not matching intelligence - is IdentityGraph's actual competitive and trust-critical design priority.
