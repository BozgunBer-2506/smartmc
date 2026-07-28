# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning tracks `docs/ROADMAP.md`'s phases rather than strict SemVer pre-1.0 - a version bump corresponds to a completed, tagged phase (see `docs/reviews/` for the review behind each one), not an API stability guarantee. Phase 0 (Product Foundation) produced no code, only the documentation set in `docs/` - it predates versioned releases and isn't listed below.

## [Unreleased]

### Fixed
- **Railway build failure** (`Module not found: Can't resolve '@smc/ui'`) - `apps/web`/`apps/api` now each have a `prebuild` script (`pnpm --filter "<pkg>^..." run build`) that builds their own workspace dependencies before their own build runs, correct regardless of what directory the build is invoked from. Root cause: gitignored `packages/*/dist` output was only ever built by Turborepo's root-level `^build` graph, which a PaaS build scoped to an app's own subdirectory skips entirely. See [ADR-0022](docs/adr/0022-self-sufficient-app-build-scripts.md).

### Added
- `apps/marketing-site` - a pre-built Next.js/Tailwind/Radix UI/Framer Motion marketing site, integrated as a fully isolated app (no shared code with `apps/web` or `packages/*`), port 3001. See [ADR-0020](docs/adr/0020-marketing-site-as-isolated-app.md). Not a roadmap phase, so no version bump - tracked here until the next tagged phase.
- `ROADMAP.md` Phase 19 - WhatsApp Connector, appended after Marketplace per explicit user direction. No other phase renumbered. No code yet - a planning-doc change only, no version bump.
- **MVP Hardening pass** (post-Phase 13, pre-Phase 14) - a cross-cutting readiness check, not a roadmap phase: a real timed end-to-end user-journey script (`scripts/verify-mvp-hardening.mjs`, 13/13 passing), an API contract audit, a frontend resilience code review, real performance measurement (all targets met), a technical-debt scan (clean), and a security re-verification. Full findings in [docs/reviews/mvp-hardening-report.md](docs/reviews/mvp-hardening-report.md).
- **Roadmap consistency fix** (2026-07-29, doc-only, no code) - `ROADMAP.md` Phase 14 was still specified as a native React Native app scaffold, contradicting `PRODUCT.md`'s own MVP-exclusion note ("web + Tauri desktop first, React Native is a v2 investment") and duplicating Phase 15's already-written PWA-first Desktop Strategy under a different platform label. Resolved: **Phase 14 is now Progressive Web App** (installable, manifest, service worker, offline shell, push notifications, background sync, responsive UI - serves both mobile and desktop installability in one implementation); **Phase 15 (Desktop) shrinks** to just evaluating whether Tauri is still needed once the PWA ships; native React Native mobile is no longer a numbered phase at all - it's v2, matching `PRODUCT.md`/`ARCHITECTURE.md`'s own existing framing, which was already correct and didn't need to change. `DESIGN_SYSTEM.md`'s several stale "Phase 14 = React Native" references updated to match. **Phase 20 - Production Readiness** appended (not inserted - no other phase renumbered) covering the two real gaps `docs/reviews/mvp-hardening-report.md` found and deferred: rate limiting and cursor pagination, plus sorting, `ETag`/`If-Match`, and observability.

### Fixed
- `Inbox.tsx` - a failed conversation-list fetch was indistinguishable from a genuinely empty inbox (both showed "None yet"); now shows a distinct error banner with Retry.

### Known Gaps (surfaced by the hardening pass, not new code changes)
- No general API rate limiting exists beyond login-attempt throttling, despite `API.md` Section 9 fully specifying it - flagged as the top-priority item before real multi-tenant traffic.
- No real cursor pagination exists anywhere, despite `API.md` Section 4 mandating it everywhere - every list endpoint uses a silent hardcoded `take` limit, and `GET /v1/rules`/`GET /v1/contacts` are fully unbounded.

## [0.13.0] - 2026-07-29 - Phase 14: Progressive Web App (`v0.13.0-phase14`)

### Added
- Web app manifest (`apps/web/app/manifest.ts`, auto-served at `/manifest.webmanifest`) with generated icons (`icon.tsx`, `apple-icon.tsx`, `icon-192`/`icon-512` route handlers via `next/og`)
- A hand-written service worker (`apps/web/public/sw.js`) covering offline app shell, Background Sync, and Web Push in one file - no `next-pwa`/workbox dependency added
- Install prompt - `beforeinstallprompt` captured, a real in-product "Install app" button
- Full Web Push stack: self-generated VAPID keys, `PushSubscription` model, `POST`/`DELETE /v1/push-subscriptions`, `PushService` wired into every automation `notification.send` action, client subscribe flow (`apps/web/lib/push.ts`)
- Background sync: an IndexedDB outbox (`apps/web/lib/offline-queue.ts`) for a reply sent while offline, replayed via the Background Sync API with an `online`-event fallback for Safari/Firefox
- Real single-pane, stack-based mobile navigation in the Inbox (`UI_GUIDE.md` Section 15) - closes a gap the earlier Phase 9 UI audit's simpler "stack vertically" fix had left open
- `pnpm --filter @smc/scripts verify:phase14` (12/12 passing) - manifest, icons, service worker, and the full push subscribe/notify/unsubscribe lifecycle

### Changed
- `ROADMAP.md` Phase 14 redefined from a native React Native scaffold to this PWA (see the roadmap-consistency commit immediately prior) - the checklist above is that redefined scope, now built.

### Known Gaps
- Client-only behavior (SW registration, install flow, offline-queue replay, push delivery) is code-complete but unverified in a real browser - no browser-automation tool available this session. Top follow-up priority.
- The service worker's app-shell cache is best-effort runtime caching, not versioned against Next's hashed build assets across deploys.
- The generated icon is a real placeholder mark, not final brand artwork (`DESIGN_SYSTEM.md` has none yet).

## [0.12.0] - 2026-07-28 - Phase 13: AI (`v0.12.0-phase13`)

### Added
- `packages/ai` (new) - the provider-agnostic `AIProvider` interface ([ADR-0021](docs/adr/0021-provider-agnostic-ai-abstraction.md)): structured input/output for `summarize`, `suggestReplies`, `detectCommitments`, `detectMeetings`, `classify`, `detectSentiment`, `detectLanguage`, `extractEntities`, `rewrite`, `suggestRule`
- `HeuristicAIProvider` - the one real, working, zero-dependency implementation this phase ships (deterministic, no API key, no external network call), the same real-not-stub precedent `MockConnector` set for connectors
- `Workspace.aiEnabled`, `AiCreditLedger`, `MessageAiSummary` (`DATABASE.md` Section 6.15, ADR-0021 Decision 5)
- `GET`/`PATCH /v1/ai/settings`, `GET /v1/ai/credits/{balance,ledger}`, `POST /v1/ai/summaries`, `POST /v1/ai/suggested-replies`, `POST /v1/ai/detect-commitments`, `POST /v1/ai/rewrite`, `POST /v1/ai/rule-suggestions` - every endpoint gated by `aiEnabled` (403) and credit balance (402)
- `AiEnrichmentService` - closes `AUTOMATION_ENGINE.md` Section 6/9's `ai` Context Object stub for real: `ai.classification`/`ai.sentiment` are now genuine rule-condition data, computed once per inbound message before rule matching, never bypassing the Automation Engine
- A starter AI credit grant (50) and `aiEnabled: true` by default at registration
- AI UI in `apps/web`: a credit-balance badge, Summarize/Suggest-replies buttons in the Inbox, and an AI rule-suggestion panel on the Automations screen (fills the rule-builder form as a draft, never auto-creates)
- `pnpm --filter @smc/scripts verify:phase13` (21/21 passing) - real, end-to-end regression check, including `ai.classification` firing a real rule and gracefully not firing once AI is disabled

### Answered
- Architecture review performed before implementation (per explicit direction): no blocking architectural gap found - `AUTOMATION_ENGINE.md`, `DATABASE.md`, `API.md`, and `ARCHITECTURE.md` had all already reserved the extension points AI needed. The one real decision (provider-agnostic abstraction boundary) is ADR-0021.
- MCP (Model Context Protocol) compatibility verified, not implemented - `AIProvider`'s structured contract doesn't block routing a future implementation through MCP tool calls; no external tool integration exists yet to justify building it now.

### Known Gaps
- Translation and smart/semantic search are not built - no real translation/embedding source exists in this environment; faking either was judged worse than not shipping.
- Task/commitment detection returns candidates only, no persisted `Commitment` entity - no such schema exists yet (Phase 11's own flagged gap).
- The new AI UI was not click-tested in a real browser (no browser-automation tool available this session).

## [0.11.0] - 2026-07-28 - Phase 12: Search (`v0.11.0-phase12`)

### Added
- `GET /v1/search/messages?q=` - real Postgres full-text search (`to_tsvector`/`plainto_tsquery`, `ts_rank`-ordered) over message body + sender display name + conversation title
- `GET /v1/search/contacts?q=` - case-insensitive substring match on `Contact.displayName`
- `GET /v1/search?q=` - the combined cross-domain endpoint, fans out to both above
- A search box in `apps/web`'s Inbox - results show messages (click to open the conversation) and contacts
- `pnpm --filter @smc/scripts verify:phase12` (9/9 passing) - real, end-to-end regression check including cross-workspace isolation

### Known Gaps
- Attachments search is not built - no `Attachment`/`MessageAttachment` model exists anywhere (no connector has ever ingested attachments), a connector-scope gap, not this phase's.
- Semantic search correctly awaits Phase 13's AI layer, per the checklist's own annotation.
- The search vector is computed live per-query, not a persisted generated column with a GIN index (no migrations mechanism to add one safely yet).
- The search UI was not click-tested in a real browser (no browser-automation tool available this session).

## [0.10.0] - 2026-07-28 - Phase 11: Notification Engine (`v0.10.0-phase11`)

### Added
- `NotificationPreference` (new model, `DATABASE.md` Section 6.14) - silent hours, VIP override, keyword alerts, one row per `(workspace, user)`
- `GET`/`PATCH /v1/notification-preferences` (`apps/api/src/notification-preferences`) - self-only, per `API.md`'s explicit authorization exception
- Real `workspace.isSilentHours`/`workspace.isVipOverrideActive`/`message.matchesKeywordAlert` Context Object primitives in `packages/automation-engine` - closes Phase 10's own disclosed `isSilentHours` stub
- The starter "Notify me on every message" rule's conditions upgraded to `NOT(silentHours) OR isVipOverrideActive OR matchesKeywordAlert` - real Emergency/override mode and Keyword alerts, expressed as an ordinary rule condition, not new engine logic
- Priority-based sound cues (`apps/web/lib/sound.ts`) - synthesized Web Audio API tones, tiered by the existing priority-score thresholds (30/60)
- A notification-preferences settings panel in `apps/web`'s Automations screen
- `pnpm --filter @smc/scripts verify:phase11` (12/12 passing) - real, end-to-end regression check, including a live silent-hours window with VIP/keyword override

### Known Gaps
- Custom sounds per VIP/contact, a first-class Waiting-On/Commitments model, and escalation rules are not built - no existing schema/spec for any of the three (unlike `notification_preferences`, which `DATABASE.md` already fully specified). Full reasoning in `docs/reviews/phase-11-review.md`.
- Notifications remain workspace-scoped, not per-user with `readAt` - silent hours/VIP override use the workspace owner's preference row as a stand-in for a genuinely per-member setting.
- The notification-preferences UI and sound cues were not click-tested in a real browser (no browser-automation tool available this session) - same disclosed limitation as Phase 10's Rules UI.

## [0.9.0] - 2026-07-28 - Phase 10: Automation Engine (`v0.9.0-phase10`)

### Added
- `packages/automation-engine` (new) - the trigger/condition/action/context model: a nested AND/OR/NOT condition evaluator, `{{message.bodyText}}`-style Context variable interpolation, a sequential action executor producing per-action results, and a registered-capability trigger catalog (`message.received`, `time.no_reply_after`)
- `RuleExecutionService` (`apps/api/src/automation`) - real rule matching (indexed on `Rule.triggerType`) and idempotent, isolated execution, replacing `EventsProcessor`'s Phase 1-9 hardcoded stub rule
- Four working action types: `notification.send`, `tag.apply` (`Conversation.tags`), `message.send` (real connector send), `webhook.call` (SSRF-guarded, blocks private/internal IP ranges - `AUTOMATION_ENGINE.md` Section 12 example #190)
- `SchedulerService` - a durable `ScheduledJob` + BullMQ delayed job per `(rule, conversation)` implementing `time.no_reply_after`, cancelled by a reply
- `RulesController` - full CRUD on `/v1/rules`, `POST /v1/rules/{id}/dry-run` (side-effect-free test), `GET /v1/rules/{id}/executions`
- `Rule`/`RuleExecutionLog`/`ScheduledJob` tables, `Conversation.tags` (`DATABASE.md` Section 6.12/6.13)
- Every new workspace now seeds a real, visible, disable-able "Notify me on every message" starter `Rule` (`AuthService.register()`), reproducing the old hardcoded notify-on-every-message behavior as data instead of code
- `Rules.tsx` in `apps/web` - a functional (not visual-canvas) rule builder, reachable via a new "Automations" button in the Inbox header
- `pnpm --filter @smc/scripts verify:phase10` (21/21 passing) - real, end-to-end regression check covering every feature above, including the scheduled trigger actually firing

### Fixed
- `packages/database/src/soft-delete.ts` - `Rule` was missing from `SOFT_DELETE_MODELS`, so a deleted rule kept appearing in `GET /v1/rules`
- `SchedulerService` - BullMQ rejects `:` in a custom job id; the original `${ruleId}:${conversationId}` key silently failed every scheduling call, so `time.no_reply_after` rules never fired

### Known Gaps
- `AUTOMATION_ENGINE.md`'s full design (visual canvas, natural-language rule creation, marketplace, time-travel simulator, step debugger, retry policy/circuit breaker/DLQ, recurring/cron triggers, condition/action snippets, workspace variables, action-chain branching) is not built - this phase ships the engine's mechanics against a deliberately narrow, disclosed slice. Full built-vs-deferred breakdown in `docs/reviews/phase-10-review.md`.
- The `Rules.tsx` UI was not click-tested in a real browser (no browser-automation tool available this session) - the API it calls is fully covered by `verify-phase10.mjs`, but the UI itself should get a real click-through.

## [0.8.0] - 2026-07-27 - Phase 9: Smart Inbox (`v0.8.0-phase9`)

### Added
- Unified priority scoring (`packages/shared/src/priority-score.ts`) - rule-based (VIP + urgency-keyword bonuses), computed at message-ingestion time, deliberately not AI-derived
- `Contact.isVip` (existed since Phase 3, unused until now) gets a real read/write surface: `PATCH /v1/contacts/{id}`
- `Conversation.isArchived`/`category`/`lastReadAt` - `PATCH /v1/conversations/{id}` (archive/category), `POST /v1/conversations/{id}/read` (mark read), and `archived`/`category`/`vip`/`unread` filters on `GET /v1/conversations`
- A trustworthy "Needs You" count (`GET /v1/conversations/summary`) - unread AND (VIP sender or priority score above a threshold), never a raw unread badge
- IdentityGraph's fuzzy-match layer: `findMergeCandidates()` (normalized display-name matching), `IdentityMatchingService`'s periodic suggestion sweep, `IdentityMergeSuggestion`/`IdentityMergeLog`/`IdentitySplitLog` (`DATABASE.md` Section 6.6), `IdentityController`'s `GET`/`POST .../approve`/`POST .../reject` on `/v1/identity/merge-suggestions`
- `POST /v1/contacts/{id}/split` - the first-class recovery action for an incorrect merge (`ARCHITECTURE.md` Section 13.6.1), transactional and audit-logged like approval
- Filters, archive/category controls, VIP indicators, and a "Possible duplicate contacts" review panel in `apps/web`'s Inbox
- `pnpm --filter @smc/scripts verify:phase9` (22/22 passing) - real, end-to-end regression check covering every feature above

### Answered
- No new ADR was needed - this phase executed the architecture ADR-0013/`DATABASE.md` Section 6.6 already committed to in Phase 3, not a new decision.

### Known Gaps
- The fuzzy-matching signal is normalized display-name comparison only (no shared-conversation-participant or handle-similarity signal); `findMergeCandidates()` is O(n²) in Contact count; suggestion-pair dedup is application-level, not a database partial-unique index. All disclosed in `docs/reviews/phase-9-review.md`.
- Splitting a Contact whose merged identities share the same provider moves every message from that provider, not just the split-off identity's own messages - `Message` has no per-sender provider/externalId of its own. Disclosed in the same review.

## [0.7.0] - 2026-07-27 - Phase 8: Email Connector (`v0.7.0-phase8`)

### Added
- A real `EmailConnector` (`packages/connector-sdk/src/email/`) making real IMAP/SMTP protocol calls via `imapflow`/`nodemailer`/`mailparser` - the fourth real connector, and the second in a row (after Slack) to need no `Connector` interface change
- `credential_entry` auth (host/port/username/password, validated via a real IMAP login + SMTP `verify()`) and `"polling"` ingestion - both already fully specified in `CONNECTOR_SDK.md` using email as their own reference example
- `EmailPollingService` - the *primary* ingestion path for mailboxes (unlike Telegram/Discord/Slack's reconciliation services, which are backstops behind a webhook/Gateway), cursor-based on IMAP UID
- Thread-based `Conversation` mapping: `conversationExternalId` resolves to the oldest `References` ancestor, falling back to `In-Reply-To`, falling back to the message's own `Message-ID`
- `POST /v1/connectors/email/connect`, `POST /v1/connectors/email/{id}/disconnect` - the simplest controller of the four connectors (no OAuth redirect, no webhook receiver)
- A "Connect Email" form in `apps/web`'s Inbox
- `pnpm --filter @smc/scripts certify:email-connector` (15/16, 1 legitimate skip) and `pnpm --filter @smc/scripts verify:email` (including a fully live SMTP send against this project's own local mailhog, independently confirmed delivered) regression checks

### Answered
- `ROADMAP.md`'s post-Phase-8 checkpoint: "four real connectors exist on one SDK... if adding connectors 2-4 took meaningfully longer than connector 1, the SDK has a design flaw." **No SDK design flaw is indicated** - the only interface change across all four connectors was Discord's (ADR-0019, Phase 6), explicitly pre-authorized for that phase alone; Slack and Email both needed none.

### Known Gaps
- No human-confirmed live message *receive* over a real IMAP mailbox yet - this project's dev stack has no local IMAP test server (mailhog is SMTP-capture only). The SMTP-send half *is* live-verified. Disclosed in full in `docs/reviews/phase-8-review.md`, not hidden.
- `Tag`/`MessageTag` (`DATABASE.md` Section 6.11) is not implemented in the schema for any connector yet - "Labels/folders mapped to Tags" is deferred as a cross-connector feature, disclosed in the same review.

## [0.6.0] - 2026-07-27 - Phase 7: Slack Connector (`v0.6.0-phase7`)

### Added
- A real `SlackConnector` (`packages/connector-sdk/src/slack/`) making real Web API calls to `slack.com/api` - the third real connector, and the first built entirely from ingestion/auth combinations the SDK already proved separately (Discord's `oauth2_redirect`, Telegram's `"hybrid"`)
- `oauth2_redirect` auth with a genuine per-workspace bot token via a real `oauth.v2.access` code exchange - unlike Discord's one app-wide bot token shared across every install
- Real `initialSync`/`reconcile` against Slack's genuine `conversations.list`/`conversations.history` endpoints - the same proof-of-generalization Discord established, now confirmed on a third provider
- `POST /v1/connectors/slack/connect`, `GET /v1/connectors/slack/callback` (a real OAuth code exchange), `POST /v1/connectors/slack/events` (the Events API webhook, app-wide rather than per-`LinkedAccount`), `POST /v1/connectors/slack/{id}/disconnect`
- HMAC-SHA256 signature verification for the Events API webhook (`crypto.timingSafeEqual`, a 5-minute replay window) - a genuinely new security-critical piece no prior connector needed, live-tested end to end with real cryptography
- `SlackApiService` (the OAuth code exchange, mirroring `TelegramApiService`'s pattern for calls outside the core `Connector` interface), `SlackOAuthStateService` (the same Redis CSRF pattern `DiscordOAuthStateService` established), `SlackReconciliationService` (the periodic list-and-diff pass)
- A "Connect Slack" control in `apps/web`'s Inbox
- `pnpm --filter @smc/scripts certify:slack-connector` (15/16, 1 legitimate skip) and `pnpm --filter @smc/scripts verify:slack` (including a fully live HMAC signature-verification round trip) regression checks

### Fixed
- `apps/api/.env` was never actually loaded into `process.env` at runtime (`DATABASE_URL` only ever worked via Prisma's own independent `.env` loading) - found while live-testing Slack's signature verification. Fixed with a single `dotenv` dependency and one import line in `apps/api/src/main.ts`; every existing `*.config.ts` accessor now works exactly as its own doc comments already described, with no other code changed.

### Known Gaps
- No human-confirmed live message exchange over a real Slack workspace yet - Slack's OAuth code can only ever be issued by a real user completing Slack's own consent screen in a browser, not scriptable at all (a bigger gap than Discord's, whose callback a script can drive). Disclosed in full in `docs/reviews/phase-7-review.md`, not hidden.
- Slack sender identity is the raw Slack user ID, not a resolved display name (`users.info` is never called) - disclosed in the same review.

## [0.5.0] - 2026-07-22 - Phase 6: Discord Connector (`v0.5.0-phase6`)

### Added
- A real `DiscordConnector` (`packages/connector-sdk/src/discord/`) making real REST calls to `discord.com/api/v10` and maintaining a real Gateway v10 WebSocket connection - the second real connector, and the first built on a genuinely different ingestion shape than Telegram's
- A real Discord Gateway client (`IDENTIFY`/heartbeat/`RESUME`/reconnect-with-backoff) using the `ws` package
- `Connector.startListening()` (returns a `StreamHandle`) and a fourth `IngestionMode` value, `"streaming"` - the SDK interface change `ROADMAP.md`'s sequencing notes explicitly anticipated for this phase (ADR-0019)
- Real `initialSync`/`reconcile` against Discord's genuine channel-history endpoint - unlike Telegram's documented no-op (ADR-0017), the first proof the Sprint 1 sync design generalizes to a provider with real history
- `POST /v1/connectors/discord/connect`, `GET /v1/connectors/discord/callback`, `POST /v1/connectors/discord/{id}/disconnect` - Discord's `oauth2_redirect` install flow (`CONNECTOR_SDK.md` Section 3.1)
- `DiscordGatewayManagerService` (owns every active guild's persistent connection) and `DiscordReconciliationService` (the periodic list-and-diff pass ADR-0019 still requires for streaming connectors)
- `DiscordOAuthStateService` - short-lived CSRF state for the OAuth redirect round-trip, reusing the project's existing Redis instance pattern
- A "Connect Discord" control in `apps/web`'s Inbox
- `pnpm --filter @smc/scripts certify:discord-connector` (15/16, 1 legitimate skip) and `pnpm --filter @smc/scripts verify:discord` regression checks
- ADR-0019: Discord Gateway - a streaming ingestion mode and Connector interface extension

### Changed
- `defineCapabilityManifest()`/`requiresReconciliation()` treat `"streaming"` the same as `"hybrid"` for the reconciliation requirement
- `ConnectorLifecycle` was already resumable from a persisted state (Phase 4 Sprint 2); Discord is the second connector to rely on it, for its `disconnect` flow

### Known Gaps
- No human-confirmed live message exchange over the real Discord network yet - requires a real Discord Application (Developer Portal Client ID/Secret/bot token, privileged `MESSAGE_CONTENT` intent, a bot added to a real test server), a bigger one-time setup than Telegram's single bot token. The user explicitly deferred this to a later session; disclosed in full in `docs/reviews/phase-6-review.md`, not hidden.

## [0.4.1] - 2026-07-21 - Phase 4 Sprint 2 / Phase 5: Telegram Connector (`v0.4.1-phase4-sprint2`)

### Added
- A real `TelegramConnector` (`packages/connector-sdk/src/telegram/`) making real HTTP calls to `api.telegram.org` - the first connector built on Sprint 1's SDK against an actual external provider
- `LinkedAccount` and `SecretRecord` Prisma models (`packages/database`) - `DATABASE.md` Section 6.5, implemented for real for the first time
- `SecretsService` (`apps/api/src/secrets/`) - an interim envelope-encrypted (AES-256-GCM) credential store standing in for the external secrets manager `SECURITY.md` specifies (ADR-0016)
- `POST /v1/connectors/telegram/connect`, `POST /v1/connectors/telegram/webhook/{linkedAccountId}` (the real webhook receiver, secret-token-verified), `POST /v1/connectors/telegram/{id}/disconnect`
- `POST /v1/conversations/{id}/messages` - the reply path, looked up through the Connector Registry rather than hardcoded to one provider
- A `TelegramReconciliationService` running the periodic half of ADR-0017's recovery strategy
- A "Connect Telegram" control in `apps/web`'s Inbox, plus a reply input and `message.sent` realtime handling
- `pnpm --filter @smc/scripts certify:telegram-connector` and `pnpm --filter @smc/scripts verify:telegram` regression checks
- ADR-0016 (interim secrets store), ADR-0017 (Telegram sync/reconciliation strategy given Bot API's shape), ADR-0018 (`LinkedAccount.status` uses the SDK's full lifecycle vocabulary) - three real architectural decisions, each resolved before the affected code was written

### Changed
- `ConnectorLifecycle` accepts an optional `initialState` (backward compatible, defaults to `"registered"`) - resumes a lifecycle from a persisted status across separate requests, not just within one connect flow
- `initialSync`/`reconcile`/`send` accept an optional `ConnectorContext` (backward compatible) - a real connector needs its resolved credential at call time, not just at `authenticate()` time
- The Certification Suite's checkpoint-resume and reconciliation checks now correctly `skip` (not fail) a legitimate zero-message result, for providers with no history endpoint
- `events.processor.ts`'s `handleMessageReceived` is now idempotent - a duplicate `(conversationId, externalId)` is a safe no-op, not a crashed job or a duplicate notification

### Security
- `SecretRecord` is deliberately excluded from the soft-delete extension - disconnecting a LinkedAccount performs a real, unconditional `DELETE`, per `SECURITY.md` Section 5.2

Verified with a complete, human-confirmed live run: a real Telegram user sent a real message to a disposable test bot, it appeared in the real Inbox with the sender resolved by name, and a reply sent from the Inbox was confirmed received on the real Telegram app on the other end.

## [0.4.0] - 2026-07-19 - Phase 4 Sprint 1: Connector SDK Foundation (`v0.4.0-phase4-sprint1`)

### Added
- The `Connector` interface (`packages/connector-sdk`) - capability manifest, credential validation/authentication with a structural ordering guarantee (`BaseConnector`), bounded/resumable initial sync, a distinct reconciliation pass, a pure normalization mapper, standardized error mapping, an optional outbound `send`, and a lifecycle state machine per account
- Capability Manifest (`defineCapabilityManifest()`) - enforces the hybrid-by-default reconciliation rule at declaration time
- The full 9-state connector lifecycle state machine (`ConnectorLifecycle`), shared by every connector, with a graph-integrity check verifying no unreachable or dead-end states
- A standardized 7-code error taxonomy (`ConnectorError`) with automatic credential redaction built into its constructor
- An in-process Connector Registry
- The Connector Certification Suite (`certifyConnector()`) - a shared, provider-agnostic conformance test mechanically exercising 16 checks drawn from the certification checklist, including a simulated worker-restart checkpoint-resume test and a rate-limit backpressure test
- `pnpm --filter @smc/scripts certify:mock-connector` - the standing regression check (16/16 passing)
- `direction` added to `InboundMessagePayload` (`packages/shared`) - a previously-hardcoded normalization field is now real
- Real ESLint + Prettier configuration (`packages/config`, populating the previously-reserved package), replacing every package's `echo "(no lint configured yet)"` stub - `pnpm lint` now runs `eslint` across all 8 code-bearing packages (7 via a shared `@smc/config/eslint-preset`, `apps/web` via `next lint` + `eslint-config-next`)
- Husky pre-commit hook (`.husky/pre-commit`) running `pnpm lint && pnpm typecheck` before every commit
- `pnpm format` / `pnpm format:check` (Prettier, via `@smc/config/prettier-preset`)

### Changed
- The Mock Connector migrated onto the new SDK as a real `Connector` implementation (`MockConnector extends BaseConnector`); `generateMockMessage()` is kept as a thin backward-compatible adapter over `MockConnector.mapMessage()` - `apps/api`'s mock-connector controller needed no changes
- `events.processor.ts` now reads `payload.direction` instead of hardcoding `"inbound"`

This release also closes the project's oldest open technical-debt item (real lint/Husky config), flagged unresolved in both the Phase 1 and Phase 2 reviews.

## [0.3.0] - 2026-07-18 - Phase 3: Identity & Messaging Foundation (`v0.3.0-phase3`)

### Added
- Real Postgres-backed Inbox read model: `GET /v1/conversations`, `GET /v1/conversations/{id}/messages`
- `GET /v1/notifications` - a real, queryable notification list
- A shared `TokenService` centralizing JWT verification for the HTTP guard, the WebSocket gateway, and the mock connector's optional-auth path
- A real login/register form and an authenticated Inbox UI in `apps/web` (conversation list, message history, notifications, live toasts)
- `pnpm --filter @smc/scripts verify:phase3` regression check (11 assertions), including a workspace-isolation proof and an unauthenticated-socket-rejected proof
- ADR-0015: REST (not GraphQL) for the Phase 3 inbox read path - no GraphQL server exists yet, and standing one up now would be new infrastructure

### Changed
- `POST /dev/mock-connector/send` now accepts an optional Bearer token: present and valid ingests into that user's real workspace; absent falls back to the `DEV_WORKSPACE_ID` dev fixture; present and invalid returns `401`
- WebSocket connections are now authenticated via JWT at connect time (`handshake.auth.token`); unauthenticated or invalid-token connections are disconnected immediately - replaces the client-supplied `?workspaceId=` query parameter
- The Mock Connector's dev-fixture Organization/Workspace upsert is now scoped to `DEV_WORKSPACE_ID` only, no longer running unconditionally for every inbound message
- `AuthException`/`authError` renamed to `httpError()` and moved from `auth/` to `common/http-error.ts`, since Phase 3 needed the same RFC 7807 helper in non-auth modules

### Removed
- `scripts/verify-realtime.mjs` - fully superseded by `verify-phase3.mjs`, which tests the same pipeline shape against real authentication instead of an unauthenticated, unscoped dev room

## [0.2.0] - 2026-07-18 - Phase 2: Authentication (`v0.2.0-phase2`)

### Added
- Email + password registration and login (`POST /v1/auth/register`, `POST /v1/auth/login`)
- JWT access tokens (15 min) with rotating refresh cookies
- Logout (`POST /v1/auth/logout`), log-out-everywhere (`POST /v1/auth/logout-all`), and active-session listing (`GET /v1/auth/sessions`)
- `GET /v1/users/me`
- `JwtAuthGuard` and `RolesGuard` - owner/admin/member RBAC foundation
- Automatic Organization + Workspace creation on registration
- Audit logging for every auth event (registration, login success/failure, logout, refresh, reuse detection)
- URI API versioning (`/v1` prefix), with `/health` and `/dev/*` intentionally excluded
- `pnpm --filter @smc/scripts verify:auth` regression check (16 assertions)
- ADR-0014: custom JWT/session authentication instead of Auth.js (which had no NestJS integration and couldn't implement the `family_id` session design)

### Changed
- `Workspace` now requires `organizationId` (local dev database was force-reset - disposable Phase 1 mock data only)
- `ARCHITECTURE.md` Section 6 corrected to describe the actual authentication mechanism

### Security
- Argon2id password hashing (never bcrypt/SHA-family)
- Password policy: 12+ characters
- Have I Been Pwned breach-password checking (k-anonymity range API, fails open on network error)
- Redis-backed account lockout on repeated failed logins (keyed by account and by IP independently)
- Refresh-token rotation with `family_id` reuse detection - presenting an already-rotated token revokes the *entire* session family, not just that token (verified live against Postgres)
- RFC 7807 (`application/problem+json`) error shape for every auth failure mode, with stable per-error `code` values

## [0.1.1] - 2026-07-18 - Phase 1 review + hardening (`v0.1.1-phase1-hardening`)

### Added
- RFC 7807 global error model (`apps/api/src/common/problem-details.filter.ts`), applied to the whole API
- Soft-delete infrastructure: `deletedAt` columns + a Prisma Client extension enforcing filtered reads and delete-as-update semantics
- `docs/reviews/phase-1-review.md` - the first Phase Review, establishing the standing per-phase review practice
- `scripts/verify-soft-delete.cjs` regression check

### Security
- Production guard on the dev-only `POST /dev/mock-connector/send` endpoint (404 when `NODE_ENV=production`)
- `LICENSE` added (all-rights-reserved - the repo is public but not open source)
- `.gitignore` hardened against secret-file and database-dump patterns beyond the original `.env`-only coverage

## [0.1.0] - 2026-07-18 - Phase 1: Bootstrap + first vertical slice (`v0.1.0-phase1`)

### Added
- pnpm + Turborepo monorepo (`apps/web`, `apps/api`, `packages/*`), per ADR-0011
- Docker Compose for local dev (Postgres, Redis, mailhog)
- Prisma schema (initial subset: Workspace, Provider, Contact, ContactIdentity, Conversation, Message, Notification)
- The Mock Connector (`packages/connector-sdk`) and the full ingestion pipeline: `message.received` event (BullMQ) → IdentityGraph exact-match resolution (`packages/identity`) → Postgres write → WebSocket push → dev Inbox UI → a hardcoded stub rule → a stub notification
- `EventEnvelope`/`EventType` (`packages/event-model`), implementing 4 of `EVENT_MODEL.md`'s ~40 cataloged events
- GitHub Actions CI (`lint` / `typecheck` / `build`)
- `scripts/verify-realtime.mjs` regression check

[Unreleased]: https://github.com/BozgunBer-2506/smartmc/compare/v0.5.0-phase6...HEAD
[0.5.0]: https://github.com/BozgunBer-2506/smartmc/compare/v0.4.1-phase4-sprint2...v0.5.0-phase6
[0.4.1]: https://github.com/BozgunBer-2506/smartmc/compare/v0.4.0-phase4-sprint1...v0.4.1-phase4-sprint2
[0.4.0]: https://github.com/BozgunBer-2506/smartmc/compare/v0.3.0-phase3...v0.4.0-phase4-sprint1
[0.3.0]: https://github.com/BozgunBer-2506/smartmc/compare/v0.2.0-phase2...v0.3.0-phase3
[0.2.0]: https://github.com/BozgunBer-2506/smartmc/compare/v0.1.1-phase1-hardening...v0.2.0-phase2
[0.1.1]: https://github.com/BozgunBer-2506/smartmc/compare/v0.1.0-phase1...v0.1.1-phase1-hardening
[0.1.0]: https://github.com/BozgunBer-2506/smartmc/releases/tag/v0.1.0-phase1
