# Smart Message Center - STATUS.md

```yaml
Title: STATUS.md
Version: 3.7
Status: Living
Owner: Founder/CTO
Last Updated: 2026-07-27
Depends On:
  - ROADMAP.md
Related ADRs:
  - ADR-0011
  - ADR-0012
  - ADR-0013
  - ADR-0014
  - ADR-0015
  - ADR-0016
  - ADR-0017
  - ADR-0018
  - ADR-0019
  - ADR-0020
```

Living status file. Updated at the end of every work session. If a new session starts cold (context lost, new machine, new day), read this file first, then [ROADMAP.md](ROADMAP.md), before doing anything else.

---

## Current Phase

**Phase 0 (Product Foundation) through Phase 5 (Telegram Connector): COMPLETE.** **Phase 6 (Discord Connector) - COMPLETE and certified**, live verification explicitly postponed (see `docs/reviews/phase-6-review.md`). **Phase 7 (Slack Connector) - COMPLETE and certified**, live verification pending a real Slack App (see `docs/reviews/phase-7-review.md`). **Phase 8 (Email Connector) - COMPLETE and certified**, with four real connectors now on one SDK and `ROADMAP.md`'s own checkpoint answered: no SDK design flaw indicated (see `docs/reviews/phase-8-review.md`). **Phase 9 (Smart Inbox) - COMPLETE** as of 2026-07-27: unified priority scoring, VIP handling, archive/categories/filters, a trustworthy "Needs You" count, and IdentityGraph's fuzzy-match/merge-suggestion/split lifecycle, all real and verified end-to-end (22/22 checks) - see `docs/reviews/phase-9-review.md`.

## What Actually Runs Right Now

From a clean checkout:

```
pnpm install          # see the environment note below - must run from real WSL, not a Windows UNC path
docker compose up -d   # Postgres (host port 5433), Redis, mailhog
pnpm db:generate && pnpm db:push
pnpm dev               # apps/web on :3000, apps/api on :4000, 6 packages in tsc --watch
```

**A real person can now**: open `http://localhost:3000`, register or log in, connect a real Telegram bot (a token from @BotFather), click "Connect Discord" to install the platform's Discord bot into their own server, click "Connect Slack" to install the platform's Slack App into their own workspace, and/or fill in "Connect Email" with a real mailbox's IMAP/SMTP host and credentials - real messages from any connected provider appear in their own Inbox in real time, sender resolved by name through IdentityGraph, then reply from the Inbox and have that reply delivered back to the real chat/mailbox. Telegram's flow is human-confirmed live end to end; Discord's, Slack's, and Email's are fully implemented and certified, with Email's SMTP-send half live-verified against a local mailhog instance, but none of the three has yet been exercised against a real Discord server / Slack workspace / IMAP mailbox for the receive half (see Phase 6/7/8 below). Sending a mock message (Phase 3's demo path) still works unchanged alongside all four.

**Connector SDK (Phase 4 Sprint 1)**: `pnpm --filter @smc/scripts certify:mock-connector` runs the Connector Certification Suite against the Mock Connector (16/16 checks passing) - the same mechanical bar every connector is held to.

**Telegram Connector (Phase 4 Sprint 2 / Phase 5)**: `POST /v1/connectors/telegram/connect` (real `getMe` validation before persistence), `POST /v1/connectors/telegram/webhook/{linkedAccountId}` (the real webhook receiver, secret-token-verified), `POST /v1/connectors/telegram/{id}/disconnect`, `POST /v1/conversations/{id}/messages` (the reply path, provider-agnostic - looked up through the Connector Registry). `pnpm --filter @smc/scripts certify:telegram-connector` (14/14 applicable, 2 legitimate skips) and `pnpm --filter @smc/scripts verify:telegram` (real-network negative-path + simulated-webhook checks) are the standing regression checks. Credentials are stored via an interim envelope-encrypted secrets store (`apps/api/src/credentials-store/`, [ADR-0016](adr/0016-interim-envelope-encrypted-secrets-store.md)) - a disclosed, pre-production gap versus `SECURITY.md`'s target external-secrets-manager design, tracked below.

**Discord Connector (new, Phase 6)**: `POST /v1/connectors/discord/connect` (returns an OAuth2 authorization URL - `CONNECTOR_SDK.md` Section 3.1's `oauth2_redirect` method), `GET /v1/connectors/discord/callback` (the real install-completion redirect target, per-guild credential validation before persistence), `POST /v1/connectors/discord/{id}/disconnect`, and the same provider-agnostic `POST /v1/conversations/{id}/messages` reply path Telegram uses. Receiving is a real Discord Gateway v10 WebSocket connection (`IDENTIFY`/heartbeat/`RESUME`/reconnect), not a webhook - the SDK's first `"streaming"` connector ([ADR-0019](adr/0019-discord-gateway-streaming-connector-extension.md)). `pnpm --filter @smc/scripts certify:discord-connector` (15/16, 1 legitimate skip) and `pnpm --filter @smc/scripts verify:discord` are the standing regression checks. Discord's `initialSync`/`reconcile` do a real bounded backfill/diff against Discord's genuine channel-history endpoint - unlike Telegram's documented no-op (ADR-0017), this is the first real proof the Sprint 1 sync design generalizes. **Not yet human-verified live** - requires a real Discord Application (Developer Portal Client ID/Secret/bot token), which the user has deferred setting up; see `docs/reviews/phase-6-review.md`.

**Slack Connector (new, Phase 7)**: `POST /v1/connectors/slack/connect` (returns an OAuth v2 authorization URL), `GET /v1/connectors/slack/callback` (a real code exchange via `oauth.v2.access`, issuing a genuinely per-workspace bot token - unlike Discord's app-wide token), `POST /v1/connectors/slack/events` (the Events API webhook, HMAC-SHA256 signature-verified), `POST /v1/connectors/slack/{id}/disconnect`, and the same provider-agnostic reply path Telegram/Discord use. `"hybrid"` ingestion (webhook + reconciliation, the same mode Telegram uses) combined with real `initialSync`/`reconcile` against Slack's genuine `conversations.history` endpoint (the same proof point Discord established, now confirmed on a third provider). No SDK interface change was needed - confirming `ROADMAP.md`'s own prediction for this phase. `pnpm --filter @smc/scripts certify:slack-connector` (15/16, 1 legitimate skip) and `pnpm --filter @smc/scripts verify:slack` (real-network config-detection + a fully live HMAC signature-verification round trip) are the standing regression checks. **Not yet human-verified live** - Slack's OAuth code can only ever be issued by a real user completing Slack's own consent screen in a browser, not scriptable at all; see `docs/reviews/phase-7-review.md`.

**Email Connector (new, Phase 8)**: `POST /v1/connectors/email/connect` (`credential_entry` auth - real IMAP login + real SMTP `verify()` before persistence), `POST /v1/connectors/email/{id}/disconnect`, and the same provider-agnostic reply path every prior connector uses. No callback/webhook endpoint exists - the simplest controller of the four. `"polling"` ingestion (`EmailPollingService`, the *primary* ingestion path here, not a backstop) with real IMAP/SMTP protocol handling (`imapflow`/`nodemailer`/`mailparser`) and thread-based `Conversation` mapping via `References`/`In-Reply-To`/`Message-ID`. No SDK interface change was needed - the second connector in a row (after Slack) to confirm it, directly answering `ROADMAP.md`'s own post-Phase-8 checkpoint: **no SDK design flaw indicated across four real connectors.** `pnpm --filter @smc/scripts certify:email-connector` (15/16, 1 legitimate skip) and `pnpm --filter @smc/scripts verify:email` (real-network negative-path checks, plus a **fully live SMTP send** against this project's own local mailhog, independently confirmed delivered) are the standing regression checks. **Not yet human-verified live for receiving** - this project's dev stack has no IMAP test server (mailhog is SMTP-capture only), so a real mailbox with an app password is needed; see `docs/reviews/phase-8-review.md`.

**Smart Inbox (new, Phase 9)**: `GET /v1/conversations` now accepts `archived`/`category`/`vip`/`unread` filters and sorts by priority then recency; `GET /v1/conversations/summary` returns a trustworthy "Needs You" count (unread AND VIP-or-high-priority, never a raw badge); `PATCH /v1/conversations/{id}` (archive/category), `POST /v1/conversations/{id}/read` (mark read). Priority scoring (`packages/shared/src/priority-score.ts`) is rule-based (VIP + urgency keywords), computed at ingestion time. `PATCH /v1/contacts/{id}` gives `Contact.isVip` (existed since Phase 3) its first real read/write surface. IdentityGraph's fuzzy-match layer is real: `IdentityMatchingService` periodically persists `IdentityMergeSuggestion` rows (`GET`/`POST .../approve`/`POST .../reject` on `/v1/identity/merge-suggestions`), and `POST /v1/contacts/{id}/split` is the first-class recovery action for an incorrect merge - both transactional, both audit-logged (`IdentityMergeLog`/`IdentitySplitLog`, append-only). No new ADR - this phase executed the architecture ADR-0013/`DATABASE.md` Section 6.6 already committed to in Phase 3. `pnpm --filter @smc/scripts verify:phase9` is the standing regression check (22/22 passing): priority scoring's base/urgency/VIP tiers, the Needs You count, mark-read, archive/category filters, and the full merge-suggestion lifecycle (generate → approve → merge → split, and generate → reject → no merge) all verified end-to-end against the real running API and Postgres. See `docs/reviews/phase-9-review.md`.

**Auth (Phase 2)**: `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `POST /v1/auth/logout-all`, `GET /v1/auth/sessions`, `GET /v1/users/me`. Registering auto-creates an Organization + Workspace + owner `WorkspaceMember`. `pnpm --filter @smc/scripts verify:auth` is the standing regression check (16/16 passing, re-confirmed clean after Phase 3).

**Identity & Messaging (new, Phase 3)**: `GET /v1/conversations`, `GET /v1/conversations/{id}/messages`, `GET /v1/notifications` - all `JwtAuthGuard`-protected, workspace-scoped from verified JWT claims only, never a client-supplied id. `POST /dev/mock-connector/send` now accepts an optional Bearer token: present and valid → ingests into that user's real workspace; absent → falls back to the `DEV_WORKSPACE_ID` fixture for continued dev convenience; present and invalid → `401`, never silently ignored. The WebSocket gateway now requires a valid JWT at connect time (`handshake.auth.token`) and disconnects anyone without one - no more client-supplied `?workspaceId=`. `apps/web` has a real login/register form and a real Inbox (conversation list, message history, notifications, live toasts). `pnpm --filter @smc/scripts verify:phase3` is the standing regression check (11/11 passing): register → reject unauthenticated socket → authenticated socket connects → mock message ingested into the real workspace → both `message.received` and `notification.created` arrive over the socket → sender resolved to a name via IdentityGraph → durability confirmed via all three new REST reads → a second, unrelated user's `GET /v1/conversations` is proven empty (workspace isolation). `verify:soft-delete` re-run clean too. `verify-realtime.mjs` (Phase 1's unauthenticated-room version) is retired, fully superseded.

**Environment note (read before re-running `pnpm install`)**: this repo sits on a WSL filesystem reached from Windows via a `\\wsl.localhost\...` UNC path. Windows-native pnpm crashes on that path (`Error: ...: is not a valid disk on Windows`, a pnpm bug, not a project misconfiguration). Run `pnpm`/`docker`/`node` commands from inside real WSL instead: `wsl.exe -d Ubuntu -- bash -lc 'cd /home/.../smartmc && <command>'`.

**Local dev database note**: Phase 2's schema change (`Workspace.organizationId` became required) forced a `prisma db push --force-reset` on the local dev database - safe, since it only held disposable Phase 1 mock-connector test data. If you're resuming on a machine with an older local DB, expect to do the same (`pnpm db:push --force-reset` from `packages/database`, or just `docker compose down -v && docker compose up -d` for a fully clean slate).

## Repository

**Structure finalized via [ADR-0011](adr/0011-monorepo-layout.md); Phase 6/7/8 added `packages/connector-sdk/src/{discord,slack,email}/` and `apps/api/src/{discord,slack,email}/`; Phase 9 added `apps/api/src/identity/` and extended `packages/identity/`; [ADR-0020](adr/0020-marketing-site-as-isolated-app.md) added `apps/marketing-site/` - the first new top-level app since ADR-0011, deliberately isolated (see below).**
```
smartmc/
├── docs/          (15 documents, adr/ [0001-0020], reviews/ [phase-1 .. phase-4-sprint-2, phase-6..phase-9])
├── apps/
│   ├── web/         Next.js - real login/register form + real Smart Inbox (filters/archive/VIP/merge suggestions) +
│   │                Connect Telegram/Discord/Slack/Email
│   ├── api/         NestJS - health, events, realtime, mock-connector, auth, users, audit,
│   │                conversations (reply endpoint + filters/summary), notifications, credentials-store,
│   │                telegram, discord, slack, email, identity (merge suggestions/contacts)
│   └── marketing-site/ Next.js/Tailwind/Radix/Framer Motion - fully isolated (ADR-0020, new), port 3001
├── packages/
│   ├── database/      Prisma schema: messaging core (Phase 1) + Organization/User/UserCredentials/
│   │                  WorkspaceMember/Session/AuditLog (Phase 2) + LinkedAccount/SecretRecord (Phase 4 Sprint 2)
│   │                  + IdentityMergeSuggestion/IdentityMergeLog/IdentitySplitLog (Phase 9) + soft-delete extension
│   ├── shared/       Canonical domain types, DEV_WORKSPACE_ID/DEV_ORGANIZATION_ID, priority-score.ts (Phase 9)
│   ├── event-model/    EventEnvelope + EventType
│   ├── identity/      IdentityGraph exact-match resolver + fuzzy matching/merge/split (Phase 9)
│   ├── connector-sdk/   Connector interface (+ streaming/StreamHandle, Phase 6), lifecycle, capability
│   │                  manifest, error taxonomy, registry, certification suite, Mock/Telegram/Discord/Slack/Email Connectors
│   ├── config/       Real ESLint + Prettier presets
│   ├── ui/          Minimal Button primitive
│   │                (automation-engine, auth, ai, design-tokens still empty, reserved per phase)
├── infrastructure/   (empty, reserved)
├── scripts/        @smc/scripts - verify-phase3.mjs, verify-soft-delete.cjs, verify-auth.mjs,
│                   certify-mock-connector.mjs, certify-telegram-connector.mjs, verify-telegram.cjs,
│                   certify-discord-connector.mjs, verify-discord.cjs,
│                   certify-slack-connector.mjs, verify-slack.cjs,
│                   certify-email-connector.mjs, verify-email.cjs,
│                   verify-phase9.mjs (new)
├── docker-compose.yml (Postgres @ 5433, not 5432)
├── LICENSE        (all-rights-reserved)
```
GitHub remote: `https://github.com/BozgunBer-2506/smartmc` - public, connected.

## Marketing Site (new, isolated addition - not a roadmap phase)

`apps/marketing-site` - a pre-built Next.js/Tailwind/Radix UI/Framer Motion marketing site, integrated per [ADR-0020](adr/0020-marketing-site-as-isolated-app.md). Fully isolated from the product (no shared code with `apps/web`, no dependency on `packages/*`), runs on port 3001 alongside `apps/web`'s 3000. Verified: `pnpm --filter @smc/marketing-site typecheck`/`lint`/`build` all pass clean; `pnpm --filter @smc/marketing-site dev` confirmed serving real rendered content. An unused `playwright-core` dependency present in the supplied source was removed during integration (no reference anywhere in `src/`). Not part of the phase-by-phase Definition of Done discipline the product apps follow - it's content-owned, not roadmap-owned.

## Phase 6 - Discord Connector (complete, certified, live human verification pending)

Full detail in `ROADMAP.md`'s Phase 6 section and [docs/reviews/phase-6-review.md](reviews/phase-6-review.md). Summary:

**Implemented**: a real `DiscordConnector` (`packages/connector-sdk/src/discord/`) making real REST calls to `discord.com/api/v10` and maintaining a real Gateway v10 WebSocket connection (`IDENTIFY`/heartbeat/`RESUME`/reconnect); `DiscordGatewayManagerService` owning every active guild's persistent connection; `DiscordReconciliationService` doing a genuine list-and-diff reconciliation pass (Discord has a real history endpoint, unlike Telegram); the OAuth2 install flow (`connect`/`callback`/`disconnect`); a "Connect Discord" control in the Inbox.

**One real architectural decision**: [ADR-0019](adr/0019-discord-gateway-streaming-connector-extension.md) - Discord's Gateway doesn't fit `CONNECTOR_SDK.md` Section 4's webhook/polling/hybrid taxonomy, so the `Connector` interface gained an optional `startListening()` method and `IngestionMode` gained a `"streaming"` value. This was the SDK interface change `ROADMAP.md`'s own sequencing notes explicitly expected and sanctioned for this phase - not a sign Phase 4 was under-designed.

**Verified**: `certify:discord-connector` (15/16, 1 legitimate skip - notably, the checkpoint-resume check that Telegram had to skip *passed for real* here, proving the Sprint 1 sync design generalizes) and `verify:discord` (real-network config-detection checks). **Not yet verified**: a human-confirmed live message exchange over the real Discord network - this needs a real Discord Application (bigger setup than Telegram's single bot token), which the user explicitly deferred to a later session. Disclosed in full in the phase review, not hidden.

Tagged `v0.5.0-phase6`.

## Phase 7 - Slack Connector (complete, certified, live human verification pending)

Full detail in `ROADMAP.md`'s Phase 7 section and [docs/reviews/phase-7-review.md](reviews/phase-7-review.md). Summary:

**Implemented**: a real `SlackConnector` (`packages/connector-sdk/src/slack/`) making real Web API calls to `slack.com/api`; `oauth2_redirect` auth with a genuine per-workspace bot token via a real `oauth.v2.access` code exchange (unlike Discord's app-wide token); `"hybrid"` ingestion (Events API webhook + `SlackReconciliationService`'s periodic list-and-diff pass, the same mode Telegram uses); real `initialSync`/`reconcile` against Slack's genuine `conversations.history` endpoint; HMAC-SHA256 signature verification for the Events API webhook (`crypto.timingSafeEqual`, a 5-minute replay window); the OAuth v2 install flow (`connect`/`callback`/`disconnect`); a "Connect Slack" control in the Inbox.

**No SDK interface change was needed** - confirming `ROADMAP.md`'s own sequencing prediction for this phase. `SlackConnector` is built entirely from combinations the SDK already proved separately (`oauth2_redirect` from Discord, `"hybrid"` from Telegram): **the Connector SDK is now validated against three independent real providers.**

**A real, pre-existing gap was found and fixed**: `apps/api/.env` was never actually loaded into `process.env` by the running app (only `DATABASE_URL` appeared to work, via Prisma's own independent `.env` loading) - found while live-testing Slack's signature verification. Fixed with one `dotenv` dependency and one import line in `apps/api/src/main.ts`; no `*.config.ts` file changed. Not an ADR - a bootstrap-gap fix, not an architecture change. See the phase review for full detail.

**Verified**: `certify:slack-connector` (15/16, 1 legitimate skip, same shape as Telegram/Discord) and `verify:slack` (real-network config-detection, plus a fully live HMAC signature-verification round trip with a real signing secret). **Not yet verified**: a human-confirmed live message exchange over a real Slack workspace - Slack's OAuth code can only ever be issued by a real user completing Slack's own consent screen in a browser, not scriptable at all. Disclosed in full in the phase review, not hidden.

Tagged `v0.6.0-phase7`.

## Phase 8 - Email Connector (complete, certified, live human verification pending for receive)

Full detail in `ROADMAP.md`'s Phase 8 section and [docs/reviews/phase-8-review.md](reviews/phase-8-review.md). Summary:

**Implemented**: a real `EmailConnector` (`packages/connector-sdk/src/email/`) making real IMAP/SMTP protocol calls via `imapflow`/`nodemailer`/`mailparser`; `credential_entry` auth (host/port/username/password, validated via a real IMAP login + SMTP `verify()`); `"polling"` ingestion where `EmailPollingService` is the *primary* receive path (not a backstop, since there is no webhook to fall back on); thread-based `Conversation` mapping via `References`/`In-Reply-To`/`Message-ID`; the simplest controller of the four connectors (`connect`/`disconnect` only - no OAuth redirect, no webhook receiver); a "Connect Email" form in the Inbox.

**No SDK interface change was needed** - the second connector in a row (after Slack) to confirm it. `ROADMAP.md`'s own post-Phase-8 checkpoint is directly answered: **four real connectors exist on one SDK, and the only interface change across all of them was Discord's (ADR-0019), explicitly pre-authorized for that phase alone. No SDK design flaw is indicated.**

**Verified**: `certify:email-connector` (15/16, 1 legitimate skip, same shape as every prior connector) and `verify:email` (real-network negative-path checks, plus a **fully live SMTP send** against this project's own local mailhog instance, independently confirmed delivered via mailhog's own message API - the strongest live-verification bar any connector phase has cleared without needing an external account). **Not yet verified**: a human-confirmed live message *receive* over a real IMAP mailbox - this project's dev stack has no IMAP test server, so a real mailbox (with an app password) is needed, the same class of external-setup gap Discord/Slack have. Disclosed in full in the phase review, not hidden.

Tagged `v0.7.0-phase8`.

## Phase 9 - Smart Inbox (complete)

Full detail in `ROADMAP.md`'s Phase 9 section and [docs/reviews/phase-9-review.md](reviews/phase-9-review.md). Summary:

**Implemented**: unified priority scoring (`packages/shared/src/priority-score.ts` - VIP + urgency-keyword bonuses, rule-based, computed at ingestion time); `Contact.isVip` (existed since Phase 3) gets a real `PATCH /v1/contacts/{id}` surface; `Conversation.isArchived`/`category`/`lastReadAt` with `archived`/`category`/`vip`/`unread` filters on `GET /v1/conversations`; a trustworthy "Needs You" count (`GET /v1/conversations/summary`); IdentityGraph's fuzzy-match layer - `findMergeCandidates()`, `IdentityMatchingService`'s periodic sweep, `IdentityMergeSuggestion`/`IdentityMergeLog`/`IdentitySplitLog` (`DATABASE.md` Section 6.6), `IdentityController`'s approve/reject endpoints, and `POST /v1/contacts/{id}/split` (the first-class incorrect-merge recovery action `ARCHITECTURE.md` Section 13.6.1 requires).

**No new ADR** - this phase executed the architecture ADR-0013/`DATABASE.md` Section 6.6 already committed to in Phase 3 (the schema's own `Contact` comment has said "Phase 9 additions" since then), not a new decision.

**Verified**: `pnpm --filter @smc/scripts verify:phase9` (22/22 passing) - real, end-to-end: priority scoring's base/urgency/VIP tiers, the Needs You count reflecting an unread VIP conversation and dropping after mark-read, archive/category filters round-tripping, and the full merge-suggestion lifecycle (two identically-named contacts → a real persisted suggestion → approve → merge → split back into two, and a second pair → reject → no merge) against the real running API and Postgres. All prior connector certify/verify scripts re-run clean - no regressions.

Tagged `v0.8.0-phase9`.

## Phase 4 Sprint 2 / Phase 5 - Telegram Connector (complete, verified live end to end)

Full detail in `ROADMAP.md`'s Phase 4 Sprint 2 and Phase 5 sections and [docs/reviews/phase-4-sprint-2-review.md](reviews/phase-4-sprint-2-review.md). Summary:

**Implemented**: a real `TelegramConnector` (`packages/connector-sdk/src/telegram/`) making real HTTP calls to `api.telegram.org`; `LinkedAccount`/`SecretRecord` persistence (`DATABASE.md` Section 6.5, previously spec-only); an interim envelope-encrypted `CredentialsStoreService` standing in for the external secrets manager `SECURITY.md` specifies; a real webhook receiver, a `getUpdates`-based reconciliation drain (ADR-0017), a real reply path (`POST /v1/conversations/{id}/messages`), and idempotent duplicate handling in the event pipeline (a real Phase 1-inherited gap, closed this sprint).

**Three real architectural decisions, each resolved via ADR before implementation**: [ADR-0016](adr/0016-interim-envelope-encrypted-secrets-store.md) (interim secrets store), [ADR-0017](adr/0017-telegram-sync-and-reconciliation-strategy.md) (Telegram's Bot API has no history endpoint and `getUpdates`/webhook are mutually exclusive), [ADR-0018](adr/0018-linked-account-status-uses-connector-sdk-lifecycle.md) (`LinkedAccount.status` uses the SDK's full lifecycle vocabulary, not `DATABASE.md`'s narrower original sketch).

**Verified with a complete, human-confirmed live run**: a real Telegram user sent a real message to a disposable test bot; it was ingested and appeared in the real Inbox with the sender resolved by name; a reply was sent from the Inbox and confirmed received on the real Telegram app on the other end - not simulated, not mocked.

Tagged `v0.4.1-phase4-sprint2`.

## Phase 4 Sprint 1 - Connector SDK Foundation (complete, verified live)

Full detail in `ROADMAP.md`'s Phase 4 Sprint 1 section and [docs/reviews/phase-4-sprint-1-review.md](reviews/phase-4-sprint-1-review.md). Summary:

**Implemented**: the `Connector` interface (`packages/connector-sdk`), a Capability Manifest that structurally enforces the hybrid-by-default reconciliation rule, the full 9-state lifecycle state machine shared by every connector, a standardized error taxonomy with automatic credential redaction, an in-process connector registry, and the Connector Certification Suite (`certifyConnector()`) - a mechanical, CI-runnable conformance test exercising 16 checks drawn from `CONNECTOR_SDK.md`'s certification checklist. The Mock Connector is migrated onto the SDK as a real `Connector` implementation; `generateMockMessage()` (Phase 1's original helper) is kept as a thin backward-compatible adapter, so `apps/api`'s mock-connector controller needed no changes.

**No ADR required** - this sprint implements `CONNECTOR_SDK.md` as already documented (it has gated Phase 1 since 2026-07-18), not a deviation from it.

**Deliberately out of Sprint 1 scope** (a real provider is needed to make these meaningful, so they're Sprint 2/Telegram's job): real webhook/polling transport, OAuth/credential-entry auth flows, `LinkedAccount` persistence, attachment abstraction, health monitoring, and real outbound retry/backoff. Full reasoning per item in the phase review.

Verified live via `pnpm --filter @smc/scripts certify:mock-connector` (16/16). `verify:phase3` (11/11), `verify:auth` (16/16), `verify:soft-delete` all re-confirmed clean against the migrated Mock Connector - no regressions.

## Phase 3 - Identity & Messaging Foundation (complete, verified live)

Full detail in `ROADMAP.md`'s Phase 3 section and [docs/reviews/phase-3-review.md](reviews/phase-3-review.md). Summary:

**Implemented**: the real Postgres-backed Inbox read model (`GET /v1/conversations`, `GET /v1/conversations/{id}/messages`), the real notifications list (`GET /v1/notifications`), Mock Connector ingestion tied to a real authenticated workspace (optional Bearer token, `DEV_WORKSPACE_ID` fallback preserved), WebSocket realtime authenticated via JWT at connect time (no more client-supplied `workspaceId`), a shared `TokenService` used by the HTTP guard, the WebSocket gateway, and the mock connector alike, and a real login/register + Inbox UI in `apps/web`.

**One real architectural deviation**: [ADR-0015](adr/0015-rest-inbox-read-path-for-phase-3.md) - `API.md` frames the inbox read path as GraphQL-first, but no GraphQL server exists anywhere in the codebase and standing one up now would be new infrastructure, contradicting this phase's explicit "no new technologies" instruction. Implemented as plain REST; GraphQL remains the Phase 9 target.

**Deliberately deferred** (per `ROADMAP.md`'s own Phase 3 checklist, not new gaps): public Workspace/account CRUD endpoints, Linked Accounts model, Tags, Folders, Search shell, user preferences (silent hours/VIP structure) - none were required by this phase's Definition of Done.

Tagged `v0.3.0-phase3`.

## Lint / Husky gap - closed 2026-07-18 (before Phase 4)

The project's oldest open item (flagged unresolved in both the Phase 1 and Phase 2 reviews) is now closed. `packages/config` (previously reserved/empty) now holds a real shared ESLint preset (`eslint-preset.js`, `eslint:recommended` + `plugin:@typescript-eslint/recommended` + `eslint-config-prettier`, non-type-aware for speed) and a shared Prettier preset (`prettier-preset.js`). All 7 non-Next code-bearing packages extend it via `.eslintrc.js` (`extends: [require.resolve("@smc/config/eslint-preset")]` - a plain string `"@smc/config/eslint-preset"` does not resolve correctly through ESLint's `eslint-config-*` naming-convention resolver once a shareable config name has a subpath, so `require.resolve()` is used to bypass that resolution and hand ESLint an absolute path directly). `apps/web` uses `next lint` + `eslint-config-next` instead, matching Next.js's own convention. A Husky pre-commit hook (`.husky/pre-commit`) now runs `pnpm lint && pnpm typecheck` before every commit. `pnpm lint`/`pnpm typecheck`/`pnpm build` all verified clean across all 8 code-bearing packages after the change (2 pre-existing `no-explicit-any` warnings in `packages/database/src/soft-delete.ts`, no errors).

## Phase 2 - Authentication (backend complete, verified live)

Full detail in `ROADMAP.md`'s Phase 2 section and [docs/reviews/phase-2-review.md](reviews/phase-2-review.md). Summary:

**Implemented**: email+password register/login (Argon2id, 12+ char policy, HIBP breach-check, Redis account lockout), JWT access tokens (15 min) + rotating refresh cookies with full `family_id` reuse-detection (verified live, including the family-wide revocation cascade), logout/logout-all/session listing, `JwtAuthGuard` + `RolesGuard` (owner/admin/member RBAC foundation, no role-gated resource yet), RFC 7807 errors for every auth failure mode, audit logging for every auth event, automatic Organization+Workspace creation on registration.

**One real architectural correction**: [ADR-0014](adr/0014-custom-jwt-session-auth.md) - `ARCHITECTURE.md` named "Auth.js," which has no NestJS integration and can't implement `DATABASE.md`'s session design. Corrected to a custom implementation of the same documented behavior, not a redesign.

**Deliberately deferred** (per `ROADMAP.md`'s own Phase 2 checklist, not new gaps): OAuth (Google/GitHub), Passkeys (schema is ready - `user_credentials.password_hash` is nullable), 2FA (TOTP), user-settings endpoints, public Organization/Workspace CRUD endpoints (that's Phase 3's "Workspace/account model"), and any login UI (Definition of Done was API-observable only).

Tagged `v0.2.0-phase2`.

## Phase 1 - Project Bootstrap (complete, reviewed, hardened)

**Sprint 1 (infrastructure)** - now fully complete. Real ESLint/Prettier config and Husky pre-commit hooks were closed 2026-07-18, before Phase 4 - see "Lint / Husky gap - closed" above.

**Sprint 2 (vertical slice)** - complete and re-verified after Phase 2's schema changes.

**Phase 1 Review** ([docs/reviews/phase-1-review.md](reviews/phase-1-review.md)): 3 findings fixed same-day and verified live - RFC 7807 error model, soft-delete infrastructure, production guard on the mock-connector endpoint. 9 findings deliberately deferred. Tagged `v0.1.0-phase1` and `v0.1.1-phase1-hardening`.

## Phase 0 - Complete Document Set (15 documents, 20 ADRs)

| Document | Core content |
|---|---|
| `PRODUCT.md` | Vision, personas, 100 problems/solutions, competitor analysis, MVP/V2, pricing, brand, Never Build list |
| `ARCHITECTURE.md` | System architecture, folder structure, DB schema draft, event flow, API design draft, **Section 6: Authentication Flow (corrected, ADR-0014)**, Section 13: IdentityGraph |
| `DATABASE.md` | Full PostgreSQL schema spec - Phase 1+2 together implement Organization/Workspace/User/UserCredentials/WorkspaceMember/Session/AuditLog + the messaging core |
| `API.md` | Full REST+GraphQL contract |
| `SECURITY.md` | Threat model, credential/secrets management, GDPR operational policy, audit logging spec - Section 4 (Auth) now implemented |
| `AUTOMATION_ENGINE.md` | The flagship differentiator - not yet implemented (Phase 10) |
| `CONNECTOR_SDK.md` | The contract any provider integration conforms to (Phase 4) |
| `EVENT_MODEL.md` | The canonical ~40-event registry (4 implemented so far) |
| `UI_GUIDE.md` | Complete UX philosophy - no UI built against it yet beyond the Phase 1 dev Inbox stub |
| `DESIGN_SYSTEM.md` | Implementation-ready design system - not yet built against |
| `ROADMAP.md` | 19 phases, working rules, Phase 1-9 verified Definitions of Done |
| `STATUS.md` | This file |
| `DECISIONS.md` | Index of all 20 ADRs |

**ADRs 0001-0020**: PostgreSQL, Prisma, REST-over-GraphQL-by-default, Connector SDK, event-driven architecture, URI versioning, UUIDv7 primary keys, two-level multi-tenancy, modular monolith + connector workers, Telegram Bot API only, monorepo layout, IdentityGraph as a first-class capability, identity merge safety over matching cleverness, custom JWT/session auth instead of Auth.js, REST (not GraphQL) for the Phase 3 inbox read path, interim envelope-encrypted secrets store, Telegram sync/reconciliation strategy given Bot API's shape, LinkedAccount.status uses the SDK's full lifecycle vocabulary, Discord Gateway streaming ingestion mode, **marketing site as an isolated app**.

## Known Open Decisions / Gaps (tracked so they aren't lost)

1. **Pricing numbers** ($12/mo Pro, $18/seat Business) - a starting hypothesis (`PRODUCT.md`), not a blocker.
2. **LinkedIn DM integration** feasibility (no public API) - deferred to Phase 16-17.
3. **`packages/database`'s Prisma schema is a pragmatic subset of `DATABASE.md`'s full spec** - `LinkedAccount` is now real (Phase 4 Sprint 2); IdentityGraph's confidence-scoring/merge-suggestion tables are now real too (Phase 9); RLS and DB role separation remain spec-only, deferred to their assigned phases.
4. **Six Phase 2 simplifications on record** (citext→app-level email normalization, no timing-attack mitigation on login, no `trust proxy` config, raw device/IP in session listing, untuned Argon2id parameters, 15-min role-change propagation delay) - all reasoned and disclosed in `docs/reviews/phase-2-review.md`, none hidden.
5. **`Notification` has no `readAt` column** - `GET /v1/notifications` (Phase 3) is read-only, no mark-read/unread state yet. Disclosed in `docs/reviews/phase-3-review.md`, deferred to whichever phase first needs it (likely Phase 11).
6. **The interim secrets store is envelope encryption in Postgres, not a real external secrets manager** ([ADR-0016](adr/0016-interim-envelope-encrypted-secrets-store.md)) - a disclosed, pre-production security posture reduction, to be closed before any real customer credential is ever stored in production. Now also holds Discord's app-wide bot token.
7. **The reply endpoint sends synchronously and returns `201`, not `API.md`'s documented `202 Accepted` + async-WebSocket-observed shape** - disclosed in `docs/reviews/phase-4-sprint-2-review.md`; revisit when a real need for async/bulk/scheduled send exists.
8. **Media/attachments, Groups/Channels, and a LinkedAccount health/status UI screen are not yet implemented for Telegram** - disclosed in `docs/reviews/phase-4-sprint-2-review.md`, deferred to their own scope.
9. **Discord's connector has not been verified live against the real Discord network** - certified against a fake API client and real-network config-detection checks only; needs a real Discord Application (Client ID/Secret/bot token) the user has deferred setting up. Disclosed in `docs/reviews/phase-6-review.md`, the concrete next step before this connector is production-ready.
10. **Discord `initialSync`/`reconcile` are bounded to 5 channels / 50 messages per channel**, and new channels created after connect are never auto-discovered - disclosed in `docs/reviews/phase-6-review.md`, deferred until real usage shows the bound is too small.
11. **`DiscordGatewayManagerService` runs inside `apps/api`'s single process**, not a separate connector-worker (`ARCHITECTURE.md`/ADR-0009's eventual split) - flagged as a known consequence in ADR-0019 itself.
12. **`packages/ui` and `apps/marketing-site` each define their own Button** (and marketing-site also has Card/Accordion/StatusPill with no `packages/ui` counterpart) - `packages/ui/src/button.tsx`'s own comment already defers real consolidation to Phase 9's design-system build-out; ADR-0020's isolation stance is intentionally revisited then, narrowly for shared UI primitives and theme tokens, not the whole marketing-site stack. `apps/web` has no Tailwind pipeline today, so sharing requires giving it one first - not a same-day file move.
13. **No staging environment exists yet** - OAuth-based connectors (Discord, Slack) are currently tested against ad-hoc Cloudflare Tunnel URLs (`*.trycloudflare.com`), which change every run and must be re-entered in the Discord/Slack developer portal each time. A persistent `staging.smartmessagecenter.com` (named Cloudflare Tunnel or a real host) would remove this friction - raised during Phase 6 live verification, still open after Phase 7/8, deferred until it actually blocks a connector sprint.
14. **Slack's connector has not been verified live against a real Slack workspace** - certified against a fake API client and real-network config-detection/signature-verification checks only; needs a real Slack App (Client ID/Secret/Signing Secret) and a real user completing Slack's own OAuth consent screen in a browser, which cannot be scripted at all (unlike Discord's callback). Disclosed in `docs/reviews/phase-7-review.md`, the concrete next step before this connector is production-ready.
15. **Slack sender identity is the raw Slack user ID, not a resolved display name** (`users.info` is never called) - disclosed in `docs/reviews/phase-7-review.md`, deferred until real usage prioritizes it.
16. **Email's connector has not been verified live for receiving against a real IMAP mailbox** - the SMTP-send half *is* live-verified (against this project's own local mailhog); the IMAP-receive half needs a real mailbox with an app password, since this project's dev stack has no local IMAP test server. Disclosed in `docs/reviews/phase-8-review.md`, the concrete next step before this connector is production-ready.
17. **`Tag`/`MessageTag` (`DATABASE.md` Section 6.11) is not implemented in `packages/database`'s Prisma schema** - Email's Phase 8 checklist explicitly named "Labels/folders mapped to Tags," making this the first connector to surface the gap directly rather than incidentally. Disclosed in `docs/reviews/phase-8-review.md`, deferred as a cross-connector feature bigger than any one connector's core receive/send loop.
18. **IdentityGraph's fuzzy-matching signal is normalized display-name comparison only** (no shared-conversation-participant or cross-provider handle-similarity signal), `findMergeCandidates()` is O(n²) in Contact count, and pending/rejected-suggestion dedup is enforced at the application level rather than a database partial-unique index (this project has no migrations mechanism beyond `prisma db push`). All three disclosed in `docs/reviews/phase-9-review.md`, deferred until real usage or a migrations mechanism makes them worth closing.
19. **Splitting a Contact whose merged identities share the same provider moves every message from that provider, not just the specific identity being split off** - `Message` has no direct per-sender provider/externalId of its own. Disclosed in `docs/reviews/phase-9-review.md`; correct in the common cross-provider-merge case, a narrower limitation in the same-provider case.

All other previously-open decisions are resolved, including the lint/Husky gap (closed 2026-07-18, see above) - see [DECISIONS.md](DECISIONS.md).

## Next Action

Phase 9 (Smart Inbox) is complete - priority scoring, VIP, archive/categories/filters, the Needs You count, and IdentityGraph's full fuzzy-match/merge/split lifecycle are all real and verified end-to-end (22/22, `verify-phase9.mjs`). Three connector live-verification items remain open from Phases 6-8, all blocked on external setup (a real Discord Application, a real Slack App, a real IMAP mailbox) rather than any code gap - none of them block Phase 10:

1. **Verify Discord live** whenever the Developer Portal is accessible again: register a real Discord Application, enable the privileged `MESSAGE_CONTENT` intent, add the bot to a test server, set `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`DISCORD_BOT_TOKEN`/`DISCORD_PUBLIC_BASE_URL`/`DISCORD_TEST_GUILD_ID` in `apps/api/.env`, run `pnpm --filter @smc/scripts verify:discord`, and manually confirm a real message round-trip through the Inbox UI - the same bar Telegram already cleared. Phase 6 stays **feature-complete, not fully validated** until this runs (see gap #9 above).
2. **Verify Slack live** whenever a real Slack App is available: register one at api.slack.com/apps, set `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET`/`SLACK_SIGNING_SECRET`/`SLACK_PUBLIC_BASE_URL` in `apps/api/.env`, subscribe to the `message.channels` event on the Events API webhook (`{publicBaseUrl}/v1/connectors/slack/events`), install the app into a real workspace via a browser (not scriptable - see gap #14), and manually confirm a real message round-trip through the Inbox UI. Phase 7 stays **feature-complete, not fully validated** until this runs (see gap #14 above).
3. **Verify Email live for receiving** whenever a real mailbox (with an app password) is available: set `EMAIL_TEST_IMAP_HOST`/`EMAIL_TEST_IMAP_PORT`/`EMAIL_TEST_SMTP_HOST`/`EMAIL_TEST_SMTP_PORT`/`EMAIL_TEST_USERNAME`/`EMAIL_TEST_PASSWORD`, run `pnpm --filter @smc/scripts verify:email`, and manually confirm a real message round-trip through the Inbox UI. The SMTP-send half is already live-verified (against local mailhog). Phase 8 stays **feature-complete, not fully validated** until the receive half runs too (see gap #16 above).
4. Otherwise, begin Phase 10 - Automation Engine (`AUTOMATION_ENGINE.md`): the flagship differentiator, and the natural home for making the Needs You threshold/urgency-keyword list configurable (gap #7 in the phase-9 review's Future Work) rather than a one-off settings screen.

## How to Resume From Zero Context

1. Read this file (`STATUS.md`).
2. Read `ROADMAP.md` for the full phase plan, working rules, and Phase 1-9's exact verification steps.
3. Read `PRODUCT.md`, `ARCHITECTURE.md` (Section 6 for auth, Section 13 for IdentityGraph), and `DECISIONS.md` for decisions already made - do not re-derive or re-litigate anything documented there.
4. To actually run the app: see "What Actually Runs Right Now" above, including the WSL environment note and the local-DB-reset note.
5. Continue from "Next Action" above, or from wherever the user redirects.
