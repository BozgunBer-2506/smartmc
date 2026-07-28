# Phase 12 Review

```yaml
Title: phase-12-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-28
Depends On:
  - ROADMAP.md
Related ADRs: []
```

A point-in-time comparison of the actual Phase 12 (Search) implementation against `ROADMAP.md`'s five-item checklist and its backing spec (`DATABASE.md` Section 14's Search Strategy, `API.md`'s search endpoint pattern). Unlike Phase 11, this phase had a real, fully-committed design to execute (Section 14 explicitly names Postgres FTS as "genuinely sufficient at MVP scale" and API.md already names the exact endpoints) - closer in spirit to Phase 10's "execute an already-decided architecture" than Phase 11's "scope a checklist with no dedicated doc."

---

## What Was Built

- **`GET /v1/search/messages?q=`** (`apps/api/src/search`) - real Postgres full-text search (`to_tsvector`/`plainto_tsquery`, ranked with `ts_rank`) over each message's body text combined with its sender's display name and conversation title, exactly the three fields `DATABASE.md` Section 14 names ("combining `body_text` with sender name and conversation title"). Workspace-scoped, soft-delete-aware, capped at 50 results.
- **`GET /v1/search/contacts?q=`** - a case-insensitive substring match (`ILIKE`) over `Contact.displayName`. Section 14 calls full-text search "optional" for this field specifically; a short proper-noun field doesn't need `tsvector` ranking to be useful, so the simpler match was the deliberate, disclosed choice here rather than reaching for the heavier mechanism because it existed.
- **`GET /v1/search?q=`** - the combined cross-domain endpoint `API.md` itself flagged as "a natural additive endpoint under this same pattern, not a redesign" - fans out to both domain searches and returns them labeled, not a single interleaved ranking (there's no meaningful way to rank a full-text relevance score against a plain name match without inventing a cross-domain scoring model this phase doesn't need).
- **A search box in `apps/web`'s Inbox** - a single query hits the combined endpoint, results show messages (clicking one opens that conversation) and contacts, both scoped to the authenticated user's own workspace.
- **`scripts/verify-phase12.mjs`** - 9 real, end-to-end checks: missing-query rejection, body-content matching, sender-name matching, no-match returns an empty array (not an error), case-insensitive contact matching, the combined endpoint's fan-out, and cross-workspace isolation.

## What Was Not Built (the honest gap against the checklist)

- **Attachments search**: no `Attachment`/`MessageAttachment` table exists anywhere in `packages/database/prisma/schema.prisma` - `DATABASE.md` Section 6.10 documents the model, but no connector phase has ever implemented attachment ingestion/storage (grepped every connector for persisted attachment data - none writes one). There is nothing to search. Building this would mean inventing attachment ingestion from scratch across every connector, a connector-SDK-level feature, not a search-phase task - genuinely out of scope here, not a quick add.
- **Semantic search**: explicitly deferred by `ROADMAP.md`'s own checklist annotation ("deferred to Phase 13 dependency - requires AI layer") - `DATABASE.md` Section 14 names the `pgvector`/`message_embeddings` design for when Phase 13 (AI) exists to produce embeddings. Correctly not attempted here.

Both are disclosed, expected gaps given the checklist's own framing - not silent cuts.

## Verified

- `pnpm --filter @smc/scripts verify:phase12` - 9/9 passing, real end-to-end against the running API and Postgres, including a genuine full-text match (finding a message by a keyword in its body that isn't in the sender name or title) and a genuine non-match (confirming irrelevant messages are excluded, not just that *some* results come back).
- `verify:phase3` (11/11), `verify:phase9` (22/22), `verify:phase10` (21/21), `verify:phase11` (12/12), and `verify:auth` (16/16) all re-run clean - this phase adds a new read-only endpoint and touches no existing write path, so no regression was expected or found.
- `pnpm lint`/`pnpm typecheck` pass clean across the whole monorepo.
- Manual smoke test: a fresh registration, a mock message containing "invoice," and a live `GET /v1/search/messages?q=invoice` round-trip were run directly against the dev server before the regression script was even written, confirming the raw SQL query works before building a whole suite around it. `apps/web` typechecks/lints clean and serves without a compile error with the new search box. Full interactive click-through (typing into the search box, clicking a result, confirming it opens the right conversation) was **not** performed - the same disclosed browser-automation-tool gap as Phases 10 and 11.

## Deliberate Simplifications (disclosed, not hidden)

| # | Finding | Reasoning | Resolution |
|---|---|---|---|
| 1 | The search vector is computed live in the query (`to_tsvector(...)` inline), not a persisted, generated `search_vector` column with its own GIN index, as `DATABASE.md` Section 14 describes as the ideal. | This project has no migrations mechanism beyond `prisma db push` to safely add a generated column (the identical reasoning `docs/reviews/phase-9-review.md` Simplification #3 already used for a partial unique index). Correct and fast enough at realistic MVP per-workspace message volume - Postgres computes `to_tsvector` over a single row's text cheaply at this scale. | **Deferred** until either a real migrations mechanism exists or real volume shows the live-computation approach costing something measurable. |
| 2 | Contact search is a plain `ILIKE` substring match, not full-text/ranked. | `DATABASE.md` Section 14 itself calls this field's full-text indexing "optional" - a short display-name field gains little from `tsvector` ranking over a simple substring match, and the simpler mechanism is honestly sufficient here, not a corner cut. | **Accepted**, not a gap. |
| 3 | The combined `/v1/search` endpoint returns two separate labeled arrays, not one cross-domain-ranked list. | Ranking a full-text relevance score against a plain name match meaningfully would require inventing a cross-domain scoring model - not needed for "see both kinds of results for one query," which is what this endpoint actually promises. | **Deferred** until a real product need for unified ranking emerges. |
| 4 | Search UI click-through wasn't done in a real browser this session. | No browser-automation tool available; the endpoint it calls is fully covered by `verify-phase12.mjs` and a manual `curl`-equivalent smoke test. | **Should be done** - same standing gap as Phases 10-11. |

## Already-Tracked Gaps, Still Open (not new)

| # | Finding | First noted |
|---|---|---|
| 5 | `packages/ui`/`apps/marketing-site` theme consolidation. | STATUS.md gap #12 |
| 6 | No staging environment. | STATUS.md gap #13 |
| 7 | Discord/Slack/Email connectors remain unverified live (postponed/blocked on external setup). | STATUS.md gaps #9/#14/#16 |
| 8 | Phase 10/11's Rules and notification-preferences UI still not click-tested in a real browser. | STATUS.md gaps #20/#22 |
| 9 | No `Attachment`/`MessageAttachment` model exists at all - not a Phase 12 gap specifically, but the reason Attachments search couldn't be built. | New here, but really a Phase 6-8 connector-scope gap, not this phase's. |

**TODOs**: grepped `apps/api/src/search` for `TODO`/`FIXME`/`HACK`/`XXX` - zero matches, consistent with every prior phase.

## Security Considerations

- Both search endpoints are `JwtAuthGuard`-protected and workspace-scoped - the raw SQL query parameterizes `workspaceId` and `q` via `Prisma.sql` tagged-template substitution (never string concatenation), so there is no SQL-injection surface despite this being the first raw-SQL query in the codebase. Confirmed via `verify-phase12.mjs`'s cross-workspace isolation check (a second user's identical query returns zero results from the first user's data).
- No new secret handling, no new external network calls - this phase reads only first-party Postgres data already covered by existing access controls.

## Decision Rule Applied

Same rule as every prior phase: implement now what's already committed (Postgres FTS over messages/contacts, per `DATABASE.md` Section 14 and `API.md`'s named endpoints); defer what genuinely requires inventing a new feature first (Attachments search needs attachment ingestion, which doesn't exist; semantic search needs Phase 13's AI layer, which doesn't exist yet either). Both deferrals were already anticipated by the checklist's own phrasing, not decisions this phase had to make unilaterally.

## Future Work

- Move to a persisted, generated `search_vector` column with a GIN index once a real migrations mechanism exists (Simplification #1).
- Build attachment ingestion/storage (a connector-SDK-level feature) before Attachments search can exist at all.
- Semantic search via `pgvector`/`message_embeddings`, once Phase 13 (AI) provides embeddings to store.
- A real click-through of the search box in a browser (Simplification #4).

## Outcome

Phase 12 ships real, working Postgres full-text search over messages (ranked, combining body/sender/title) and a simpler substring match over contacts, plus the cross-domain endpoint `API.md` already anticipated - closely executing an already-committed design rather than inventing new scope, the way Phase 10 executed `AUTOMATION_ENGINE.md`. Attachments search and semantic search are both correctly deferred: one because the data it would search doesn't exist anywhere in the product yet, the other because its own checklist entry already named its real dependency (Phase 13).
