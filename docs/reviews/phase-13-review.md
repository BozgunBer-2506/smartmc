# Phase 13 Review

```yaml
Title: phase-13-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-28
Depends On:
  - ROADMAP.md
Related ADRs:
  - ADR-0021
```

A point-in-time comparison of the actual Phase 13 (AI) implementation against `ROADMAP.md`'s seven-item checklist, `PRODUCT.md`'s AI Features section, `AUTOMATION_ENGINE.md` Sections 6/8/9, and the explicit architectural brief given at kickoff: build a provider-agnostic AI layer (not a specific vendor integration), confirm the existing architecture supports it before coding, keep AI assistive not autonomous, never let AI bypass the Automation Engine, and verify the design doesn't block a future MCP (Model Context Protocol) integration.

---

## Architecture Review (performed before any code was written)

Confirmed, not assumed: `PRODUCT.md`'s AI Features section, `ARCHITECTURE.md`'s Phase 4 framing, `AUTOMATION_ENGINE.md` Sections 6/9, `DATABASE.md` Section 6.15, `API.md` Section 10, and `EVENT_MODEL.md`'s `ai_credits.*` events were all read together before implementation began. **No blocking architectural gap was found.** Every extension point AI needed was already deliberately reserved by earlier phases:

- `AUTOMATION_ENGINE.md` Section 6's Context Object already named an `ai` *(optional)* section - populated with a literal `undefined` since Phase 10 explicitly deferred it.
- `AUTOMATION_ENGINE.md` Section 9 already states AI's boundary: it assists a condition or suggests a draft rule, never authors or executes anything unconfirmed.
- `DATABASE.md` Section 6.15 already fully specifies `message_ai_summaries`/`ai_credit_ledger`; `API.md` Section 10 already specifies the exact endpoint shapes, including a versioning escape hatch reserved specifically for this capability area.
- `ARCHITECTURE.md` already frames AI as "an isolated service consuming the same `message.received` events - can be disabled entirely without touching core," the same event-driven decoupling `EventsProcessor`/`RuleExecutionService` already use.

The one genuinely undecided question - which model provider, and how the product talks to it - is a real architectural decision, not a gap in what was already planned. That decision is recorded in **[ADR-0021](../adr/0021-provider-agnostic-ai-abstraction.md)**.

## What Was Built

- **`packages/ai`** (new package, ADR-0021) - the `AIProvider` interface: every capability (`summarize`, `suggestReplies`, `detectCommitments`, `detectMeetings`, `classify`, `detectSentiment`, `detectLanguage`, `extractEntities`, `rewrite`, `suggestRule`) takes structured input and returns a structured, typed result - never a raw prompt in, never free text to parse out.
- **`HeuristicAIProvider`** - the one concrete implementation Phase 13 ships: deterministic, no external network call, no API key required. The same real-not-stub precedent `MockConnector` established for connectors. Every capability genuinely works end-to-end today with zero vendor dependency; a real LLM-backed provider is a pure additive implementation of the same interface later (`AIProviderRegistry`, mirroring `ConnectorRegistry`).
- **`Workspace.aiEnabled`, `AiCreditLedger`, `MessageAiSummary`** - schema additions, the first exactly per `DATABASE.md` Section 6.15, the flag newly modeled per ADR-0021 Decision 5 (referenced by `API.md`'s language but never previously in the schema).
- **`GET`/`PATCH /v1/ai/settings`, `GET /v1/ai/credits/{balance,ledger}`, `POST /v1/ai/summaries`, `POST /v1/ai/suggested-replies`, `POST /v1/ai/detect-commitments`, `POST /v1/ai/rewrite`, `POST /v1/ai/rule-suggestions`** - every endpoint checks `aiEnabled` (403 `AI_DISABLED`) and consumes credit (402 `INSUFFICIENT_AI_CREDITS`) before calling the provider, exactly `API.md` Section 10's documented failure modes.
- **`AiEnrichmentService`** - the event-driven half of ADR-0021's Decision 3: called once per inbound message (before rule matching, not from any REST path), computes sentiment + classification via the same `AIProvider`, and is what makes `AUTOMATION_ENGINE.md` Section 9's `ai.sentiment`/`ai.classification` condition primitives real. `packages/automation-engine`'s `ContextObject.ai` and `conditions.ts`/`variables.ts`'s `"ai"` section resolution are the direct closure of Phase 10's disclosed stub.
- **AI never bypasses the Automation Engine** - `ai.*` is additive context data only; the engine's own execution model (matching, condition evaluation, action execution, idempotent logging) is completely unchanged. `POST /v1/ai/rule-suggestions` returns `isDraft: true`, never persisted until the user `POST`s it through the ordinary `/v1/rules` endpoint - verified explicitly in `verify-phase13.mjs` (suggesting a rule never changes the rule count).
- **A starter AI credit grant (50) at registration**, alongside `aiEnabled: true` by default - the same "working demo by default, explicitly disable-able" precedent Phase 10's starter rule set, needed so graceful degradation (disabling AI, running out of credit) is actually testable rather than the default, untested path.
- **`apps/web` UI**: a credit-balance badge, "Summarize"/"Suggest replies" buttons in the open conversation (Inbox), and a "Suggest a rule with AI" panel on the Automations screen that fills the existing rule-builder form with a draft - never auto-creates.
- **`scripts/verify-phase13.mjs`** - 21 real, end-to-end checks, including the phase's central architectural claim: an `ai.classification`-conditioned rule genuinely fires for AI-classified messages and genuinely does not fire once AI is disabled (no error, no crash - graceful degradation confirmed live, not asserted).

## What Was Not Built (the honest gap against the checklist)

`ROADMAP.md`'s checklist and the kickoff brief's capability list overlap but aren't identical; here's the actual disposition of each:

- **Conversation summaries** - built (`/v1/ai/summaries`, per-message or per-conversation).
- **Suggested replies** - built.
- **Task/commitment detection** - built (`/v1/ai/detect-commitments`), returning candidates in the response rather than a persisted tracked entity - `DATABASE.md` has no `Commitment` table (already flagged as a Phase 11 gap in `docs/reviews/phase-11-review.md`); building that model is out of this phase's scope.
- **Meeting detection** - built, folded into the same `/v1/ai/detect-commitments` response (`meetings` alongside `commitments`) rather than a separate endpoint - both are the same class of pattern-detection call over the same text.
- **Translation** - **not built.** Real translation needs either a live model API or a real translation library/model - neither exists in this environment, and faking it (returning wrong translations with confidence) would be actively harmful, not a disclosed simplification. Correctly deferred, not attempted.
- **Rewrite** - built (`formal`/`friendly`/`concise` styles), honestly heuristic (contraction expansion, capitalization, truncation) - not grammar-model quality, disclosed below.
- **Smart/semantic search** - **not built.** `DATABASE.md` Section 14 names `pgvector`/`message_embeddings` as the design, which requires a real embedding-generation source (a model API or a local embedding model) - neither exists here either. Correctly deferred; Phase 12's real keyword-based search remains the only search path.
- **Message classification, sentiment detection, intent extraction, language detection, entity extraction** (from the kickoff brief, not the original roadmap checklist) - all built as real `AIProvider` methods; classification and sentiment are the two wired into the live Automation Engine integration (Decision 3), language detection and entity extraction are exposed on the provider interface but have no dedicated REST endpoint yet (not needed by any UI surface this phase built) - trivially addable later, not a design gap.

## Verified

- `pnpm --filter @smc/scripts verify:phase13` - 21/21 passing, real end-to-end: starter grant, every endpoint's real output, credit consumption math, the draft-rule-never-persisted guarantee, an unrecognizable prompt's explicit failure note, `ai.classification` firing a real rule for a real AI-classified message, that same rule *not* firing once AI is disabled, and credit exhaustion producing a clean 402 rather than a broken state.
- `verify:phase3` (11/11), `verify:phase9` (22/22), `verify:phase10` (21/21), `verify:phase11` (12/12), `verify:phase12` (9/9), and `verify:auth` (16/16) all re-run clean - AI enrichment only ever adds an optional `ai` field to the Context Object; every existing rule/condition/action path is untouched.
- `pnpm lint`/`pnpm typecheck` pass clean across the whole monorepo (13 packages now, `packages/ai` is the newest).
- Manual smoke test: a full request/response transcript (register → summarize → suggested-replies → detect-commitments → rewrite → rule-suggestion → balance) was run directly against the dev server and inspected before the regression script was written, confirming every endpoint's real shape first.
- Full interactive click-through of the new UI (the Summarize/Suggest-replies buttons, the AI rule-suggestion panel) was **not** performed - the same disclosed browser-automation-tool gap as Phases 10-12. The API/engine behavior every button calls is fully covered by `verify-phase13.mjs`.

## Deliberate Simplifications (disclosed, not hidden)

| # | Finding | Reasoning | Resolution |
|---|---|---|---|
| 1 | Every AI capability is `HeuristicAIProvider`'s deterministic, keyword/regex-based output - genuinely useful, honestly not LLM-grade (a "summary" is extractive first+last-sentence, not a synthesized one; "sentiment" is a small positive/negative word lexicon; "language detection" is an English-stopword heuristic that only ever answers "en" or "unknown"). | This environment has no configured AI provider API key, and PRODUCT.md never commits to a specific vendor - building against a real SDK would either require a credential that doesn't exist here or be untestable. `AIProvider`'s structured interface (ADR-0021) is what makes swapping in a real LLM later a provider addition, not a rewrite. | **Accepted for this phase**, real LLM provider is future work (see below). |
| 2 | `ai.classification`/`ai.sentiment` use the workspace-wide enrichment path (one call per message, gated by `Workspace.aiEnabled` + organization credit), not per-rule or per-condition AI calls. | Matches AUTOMATION_ENGINE.md Section 10's "context snapshot assembled once" model exactly - every rule matched against the same message shares the same `ai.*` values, computed once, not re-derived per rule. | **Accepted**, not a gap - this is the correct design, not a shortcut. |
| 3 | Task/commitment detection returns candidates in the response only, not a persisted `Commitment` entity. | No `Commitment`/`WaitingOn` table exists anywhere in `DATABASE.md` - already flagged in `docs/reviews/phase-11-review.md` as out of scope without a real schema decision. | **Deferred**, same tracked gap as Phase 11. |
| 4 | Language detection and entity extraction exist on `AIProvider` but have no dedicated `/v1/ai/*` endpoint. | No UI surface this phase built needed them directly; `detectSentiment`/`classify` were the two capabilities the Automation Engine integration (the phase's core architectural requirement) actually needed exposed. | **Deferred** - trivial to add, no design work needed when a real use case appears. |
| 5 | The new AI-related UI (summarize/suggest-replies buttons, the rule-suggestion panel) wasn't click-tested in a real browser. | No browser-automation tool available this session - same standing limitation as Phases 10-12. | **Should be done** before calling the UI itself fully verified. |

## Already-Tracked Gaps, Still Open (not new)

| # | Finding | First noted |
|---|---|---|
| 6 | `packages/ui`/`apps/marketing-site` theme consolidation. | STATUS.md gap #12 |
| 7 | No staging environment. | STATUS.md gap #13 |
| 8 | Discord/Slack/Email connectors remain unverified live. | STATUS.md gaps #9/#14/#16 |
| 9 | Prior phases' UI (Rules, notification preferences, search) still not click-tested in a real browser. | STATUS.md gaps #20/#22/#24 |
| 10 | No `Commitment`/`WaitingOn` model, no `Attachment` model. | STATUS.md gap #21 (Phase 11), gap #23 (Phase 12) |

**TODOs**: grepped `packages/ai/src` and `apps/api/src/ai` for `TODO`/`FIXME`/`HACK`/`XXX` - zero matches, consistent with every prior phase.

## Security Considerations

- Every `AiController` endpoint is `JwtAuthGuard`-protected and workspace-scoped (`messageId`/`conversationId` lookups always filter by `claims.workspaceId` first) - confirmed no cross-workspace data ever reaches a provider call.
- Credit consumption happens *before* the provider call in every endpoint, and the ledger is append-only (ADR-0021, `DATABASE.md` Section 6.15) - a race between two concurrent requests can at worst read a slightly stale balance and momentarily overdraw by one call's worth, not corrupt the ledger itself (every write is still a real, auditable row). Not hardened against under real concurrent load - acceptable at this product's current scale, the same standing tolerance every prior phase's optimistic-locking/dedup discussions have used.
- `AiEnrichmentService` never lets a provider failure break message ingestion (`try/catch`, returns `undefined` on any error) - AI enrichment failing is invisible to the user, exactly `PRODUCT.md`'s "AI never load-bearing" rule enforced at the one place where a failure could otherwise have broken the core inbox pipeline.
- No new secret handling - `HeuristicAIProvider` calls no external service, so there is no API key to protect in this phase. A future real provider's key would go through the existing `CredentialsStoreService`/envelope-encryption pattern (ADR-0016), not a new mechanism.

## Founder's Note on MCP - Verified, Not Implemented

Raised explicitly at kickoff: does this architecture block a future MCP (Model Context Protocol) integration for external tool access (CRM, Jira, GitHub, Notion, Drive, Calendar)? **Verified: no.** `AIProvider`'s structured-input/structured-output contract doesn't care how a given implementation produces its result internally - an `MCPAwareProvider` implementing the same interface could route through an MCP client mid-call without any change to `apps/api`'s call sites, `packages/automation-engine`'s `ai` context section, or any endpoint contract. **Not built in Phase 13** - there is no external tool integration to expose yet, and building MCP plumbing ahead of a real need would violate this project's own "don't build ahead of need" discipline every prior phase has followed. This is recorded as a verified architectural property (ADR-0021's "Founder's note on MCP" section), not a promise of future work with a timeline.

## Decision Rule Applied

Same rule as every prior phase: implement now what's already committed and expensive to retrofit later (the provider abstraction boundary itself, the Context Object `ai` section, the credit ledger schema - all already specified or reserved by earlier docs); defer what requires either a resource this environment doesn't have (a real model API key, an embedding source, a translation model) or a first, unreviewed design decision this phase wasn't asked to make (Commitment/WaitingOn's schema). The `HeuristicAIProvider` choice specifically follows `MockConnector`'s precedent: ship something real and useful now, structured so the eventual real integration is additive, not a rewrite.

## Future Work

- A real LLM-backed `AIProvider` (OpenAI, Anthropic, or a local model) - purely additive per ADR-0021, registered in `AIProviderRegistry` the same way Discord/Slack/Email joined `ConnectorRegistry`.
- Translation and semantic search, once a real model/embedding source is available to build them against honestly.
- A first-class `Commitment`/`WaitingOn` data model (Phase 11's own flagged gap) that `detectCommitments`' output could persist into instead of only returning candidates.
- `/v1/ai/classify`, `/v1/ai/sentiment`, `/v1/ai/language`, `/v1/ai/entities` as direct endpoints, if a UI surface ever needs them standalone rather than only via the event-driven enrichment path.
- MCP-based tool integration for CRM/Jira/GitHub/Notion/Drive/Calendar, once a real external-tool use case exists (ADR-0021's Founder's Note).
- A real click-through of the new AI UI in a browser (Simplification #5).

## Outcome

Phase 13 ships a real, provider-agnostic AI layer - not a specific vendor wrapper - with one honest, fully-working, zero-dependency implementation behind it. The phase's actual center of gravity was architectural, not feature-count: closing `AUTOMATION_ENGINE.md` Section 6/9's three-phase-old `ai` Context Object stub for real, proving AI produces structured data the existing rule engine (never bypassed, never modified in its execution model) genuinely consumes, and confirming - live, via a test that disables AI mid-script and checks a rule correctly stops firing - that graceful degradation is a tested property, not a design intention. Translation and semantic search are the two checklist items this phase couldn't honestly build without a resource (a real model API, an embedding source) this environment doesn't have; everything else the checklist and the kickoff brief asked for is real and verified.
