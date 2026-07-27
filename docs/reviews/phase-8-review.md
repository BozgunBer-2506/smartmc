# Phase 8 Review

```yaml
Title: phase-8-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-27
Depends On:
  - ROADMAP.md
Related ADRs: []
```

A point-in-time comparison of the actual Phase 8 (Email Connector) implementation against `PRODUCT.md`, `ARCHITECTURE.md`, `CONNECTOR_SDK.md`, `EVENT_MODEL.md`, `SECURITY.md`, `DATABASE.md`, all ADRs current at the time, and `ROADMAP.md` - the eighth in the standing per-phase review practice, and the last of the four connectors `ROADMAP.md`'s own "Notes on Sequencing" named as the Connector SDK's pressure test: "a forced SDK change at Phase 7/8 [should be treated as] a signal to stop and reassess, not as a routine cost." No such change was needed - confirmed below, and reconfirmed explicitly before any code was written, per this session's own working rule for this phase.

---

## What Was Built

The fourth real connector, and the first built entirely from the two SDK concepts `CONNECTOR_SDK.md` had already used **email itself** as the worked example for:

- **`EmailConnector`** (`packages/connector-sdk/src/email/`) - a real `Connector` implementation making real IMAP/SMTP protocol calls, injected with an `EmailApiClient` (a `RealEmailApiClient` by default, swappable for tests/certification - the same pattern every prior connector uses).
- **`credential_entry` auth** (`CONNECTOR_SDK.md` Section 3.1 - "IMAP/SMTP... Host/port/username/password... validated via a real connection attempt before persisting", named there as the reference example for this auth method). `EmailCredential` is `{ imapHost, imapPort, imapSecure, smtpHost, smtpPort, smtpSecure, username, password }` - no OAuth redirect, no platform-wide app registration, the simplest auth flow of the four connectors.
- **`"polling"` ingestion** (`CONNECTOR_SDK.md` Section 4.2 - "IMAP without IDLE support, or any provider without a push mechanism", again named there as the reference example). `requiresReconciliation()` already excludes `"polling"` from the reconciliation-interval requirement, since polling *is* the primary ingestion mechanism here, not a backstop layered on top of a webhook.
- **Thread-based `Conversation` mapping** (`ROADMAP.md`'s "Threading mapped to Conversation model") - `conversationExternalId` resolves to the oldest ancestor in the `References` header, falling back to `In-Reply-To`, falling back to the message's own `Message-ID` when it starts a new thread. A pure function of the message's own headers (`resolveThreadId()`), not a lookup - no SDK change needed, since `NormalizedMessage.conversationExternalId` was always a free-form, connector-chosen string.
- **`EmailController`** (`apps/api/src/email/`) - `POST /v1/connectors/email/connect` (a real IMAP login + a real SMTP `verify()` before persistence), `POST /v1/connectors/email/{id}/disconnect`. No callback/webhook endpoint exists at all - the simplest controller of the four, since `credential_entry` needs no OAuth redirect and `"polling"` needs no webhook receiver.
- **`EmailPollingService`** (`apps/api/src/email/email-polling.service.ts`) - unlike Telegram/Discord/Slack's `*ReconciliationService` classes (all backstops behind a webhook or Gateway), this is the **primary** ingestion path: every connected mailbox is polled on an interval (`EMAIL_POLL_INTERVAL_MS`, default 2 minutes), cursor-based via IMAP UIDs, durable across restarts.
- **Real IMAP/SMTP libraries** (`imapflow`, `nodemailer`, `mailparser`) - a genuine, justified dependency addition, the same reasoning `ws` was justified for Discord's Gateway (ADR-0019): IMAP is a stateful, line-based protocol and MIME is a real parsing problem (multipart, quoted-printable, charset conversion) - hand-rolling either would be a significant, risky reimplementation for no benefit over well-maintained, widely-used libraries from the same maintainer ecosystem nodemailer itself belongs to.
- **A "Connect Email" form in `apps/web`'s Inbox** - IMAP host, SMTP host, address, and password fields (ports/TLS defaulted to the common `993`/`465`/secure-on case rather than exposed, avoiding over-building a rarely-needed advanced-config UI for this phase).
- **Reused without any changes**: `LinkedAccount`/`SecretRecord` persistence, `CredentialsStoreService`, the Connector Registry, the idempotent-duplicate-handling fix from Phase 4 Sprint 2, and the reply endpoint - `send()` slotted into `POST /v1/conversations/{id}/messages` with zero changes to that endpoint, the fourth connector in a row to do so.

## No SDK Interface Change Was Needed

Reconfirmed explicitly before writing any code, per this phase's working rule: `EmailConnector` needed no new `Connector` interface member and no new `IngestionMode`/auth-method value. Both `credential_entry` and `"polling"` were not just already supported but were `CONNECTOR_SDK.md`'s own named reference examples for email specifically, written in Sprint 1 before any real connector existed. **Four real connectors now exist on one SDK, and the only interface change across all of them was Discord's (ADR-0019, Phase 6) - explicitly pre-authorized by `ROADMAP.md` for exactly that phase, and confirmed as a one-time exception, not a pattern, by Slack (Phase 7) and now Email (Phase 8) both needing none.** This is the concrete answer to `ROADMAP.md`'s own checkpoint question below.

## `ROADMAP.md`'s Own Checkpoint, Answered

> "Checkpoint after Phase 8: four real connectors exist on one SDK. If adding connectors 2-4 took meaningfully longer than connector 1 (relative to their native API complexity), the SDK has a design flaw - fix it before Phase 9, not after."

Telegram (connector 1) required building the SDK's real credential/lifecycle/sync/error-mapping plumbing for the first time - the highest-cost connector by construction, not comparable on effort alone. Connectors 2-4 each added real, provider-specific work roughly proportional to their own native complexity: Discord's Gateway (a genuinely new protocol shape, the one sanctioned exception), Slack's OAuth code exchange and Events API signature verification (real, provider-specific security work), Email's IMAP/SMTP protocol handling and thread-resolution logic (real, provider-specific parsing work). None required re-touching the `Connector` interface, the lifecycle state machine, the error taxonomy, the certification suite's structure, or the platform-side registry/reply-endpoint/event-pipeline code paths that already existed. **No SDK design flaw is indicated** - the checkpoint is answered, not deferred.

## Verified

- `pnpm --filter @smc/scripts certify:email-connector` (15/16 checks passing, 1 correctly skipped - the same `send()`/`simulateFailure()` hook gap every prior real connector class also doesn't expose).
- `pnpm --filter @smc/scripts verify:email` - real-network checks against the running API: missing-field validation, a real IMAP connection attempt against an unresolvable host correctly rejected with `422 INVALID_EMAIL_CREDENTIAL`, and a **fully live SMTP send** against this project's own local `mailhog` instance (`docker-compose.yml`) - genuine wire-protocol traffic through `RealEmailApiClient`, confirmed to have actually arrived via mailhog's own message API (`GET /api/v2/messages`), not merely "did not throw."
- `certify:mock-connector` (16/16), `certify:telegram-connector` (14/14, 2 skips), `certify:discord-connector` (15/15, 1 skip), `certify:slack-connector` (15/15, 1 skip), `verify:phase3` (11/11), `verify:auth` (16/16), `verify:soft-delete`, `verify:telegram`, `verify:discord`, `verify:slack` all re-run clean - no regressions.
- `pnpm lint`/`pnpm typecheck`/`pnpm build` all pass clean across the whole monorepo (12 workspace packages, including the new `imapflow`/`nodemailer`/`mailparser` dependencies).

### Not Verified Live - Disclosed, Not Hidden

Unlike Telegram's Phase 4 Sprint 2 bar, this phase does **not** include a human-confirmed live message exchange over a real IMAP mailbox. Two distinct things are true here, not one: the **SMTP send half is genuinely live-verified** (against mailhog, above) - a stronger live-verification bar than Discord's or Slack's phase reviews could claim for any part of their flow, since neither has a local test target at all. The **IMAP receive half** has no equivalent local target: this project's `docker-compose.yml` runs mailhog (SMTP-capture only, no IMAP server) and nothing else mail-related, so a real IMAP mailbox (a real Gmail/Outlook/etc. account, ideally with an app password) is needed the same way Discord/Slack needed a real Developer/App Portal setup - `verify-email.cjs`'s full connect/poll flow is written and ready, gated behind `EMAIL_TEST_IMAP_HOST` and friends, deliberately not exercised this session per the same "user's own external account, on their own timeline" pattern Discord and Slack both already established.

## Deliberate Simplifications (disclosed, not hidden)

| # | Finding | Reasoning | Resolution |
|---|---|---|---|
| 1 | Only `INBOX` is polled - other folders are never discovered or synced, and `ROADMAP.md`'s "Labels/folders mapped to Tags" checklist item is not implemented. | `Tag`/`MessageTag` (`DATABASE.md` Section 6.11) is fully spec'd but not yet in `packages/database`'s Prisma schema for *any* connector - building a whole new tagging domain feature (schema, UI, cross-provider semantics) is a materially larger scope than this connector's core receive/send loop needs, and no other connector has needed it either. | **Deferred** - a real, disclosed scope cut, not a corner silently cut. |
| 2 | Sender display name is whatever the `From` header's display name contains (or the bare address if absent) - no IdentityGraph-side email-specific enrichment beyond what already exists. | Consistent with every prior connector's `senderDisplayName` derivation - a provider-supplied string, not a resolved profile lookup. | **Accepted**, not a gap - this is the same shape every connector already uses. |
| 3 | Attachments are not downloaded/stored - `mailparser`'s parsed output includes attachment metadata but it is never read; an attachment-only message maps to whatever plain-text part exists, or `"[Empty message]"`. | Consistent with Telegram/Discord/Slack's identical, already-disclosed simplification - `CONNECTOR_SDK.md` Section 12's storage flow remains platform-wide and unbuilt. | **Deferred**, same as every prior connector. |
| 4 | Message edits/deletions are not applicable - email has no native edit/delete-after-send concept the way Slack/Discord do, so `messageEditing`/`messageDeletion` are both `false` in the capability manifest, not a built-vs-not-built distinction. | This is an honest reflection of the provider's actual capability, not a simplification. | **Accepted** as correct, not a gap. |
| 5 | `groupManagement: "read_only"` - there is no group/participant concept in a single mailbox's IMAP connection to manage. | Same honest-manifest reasoning as Slack's identical declaration (`docs/reviews/phase-7-review.md` #7). | **Accepted** as correct, not a gap. |
| 6 | The poll interval (`EMAIL_POLL_INTERVAL_MS`, default 2 minutes) is a single global default, not tunable per-mailbox or adaptive to provider rate limits. | A reasonable default for a first implementation; real usage (or a specific provider's documented rate limit) would inform a smarter policy later. | **Deferred** until real usage shows the default is wrong. |
| 7 | The full credential (including non-secret fields like host/port/username) is stored as one JSON blob in the encrypted secret store, rather than splitting sensitive (password) from non-sensitive (host/port) fields the way Discord/Slack split token from guild/team id. | `LinkedAccount.externalAccountId` is a single string field, sized for an identifier like a guild/team id or Telegram user id - not a structured multi-field blob. Encrypting the whole credential together is simpler and strictly more conservative (nothing that's arguably sensitive is left unencrypted), traded for that simplicity over a marginal optimization. | **Accepted** - simplicity over a micro-optimization, the same trade-off rule Discord's phase-6 review already applied elsewhere. |

## Already-Tracked Gaps, Still Open (not new)

| # | Finding | First noted |
|---|---|---|
| 8 | `packages/database`'s Prisma schema remains a pragmatic subset of `DATABASE.md`'s full spec, now also missing `Tag`/`MessageTag` for the first time a connector's own checklist explicitly named them (Simplification #1). | Phase 1/2/3/4 reviews |
| 9 | The interim secrets store (ADR-0016) remains a disclosed pre-production gap versus `SECURITY.md`'s external-secrets-manager target - now also holding full email credentials (host/port/username/password) as one JSON blob per mailbox. | Phase 4 Sprint 2 review |
| 10 | Discord's and Slack's connectors remain unverified live against their real networks (both postponed per explicit user direction). | Phase 6/7 reviews |

**TODOs**: none - grepped `packages/connector-sdk/src/email`, `apps/api/src/email`, and the new/changed scripts for `TODO`/`FIXME`/`HACK`/`XXX`, zero matches, consistent with every prior phase.

**Confirmed on-track, no deviation**: credential validation always precedes persistence, now validated via a real IMAP login plus a real SMTP `verify()` call, both before any persistence (Section 3.2); the error taxonomy's 7 codes are exercised against real IMAP/SMTP error shapes (auth failure, connection failure, rate limiting via SMTP 4xx codes, rejection via SMTP 5xx codes); the normalization contract's required fields match exactly; a mailbox's own sent-and-visible-in-INBOX messages are filtered via `isOwnMessage` the same way Discord/Slack filter bot-authored messages, avoiding self-loops; UUIDv7 for every new row; soft-delete correctly applies to `LinkedAccount` and correctly does not apply to `SecretRecord`.

## Security Considerations

- Email credentials go through the identical `CredentialsStoreService` path every prior connector's credential does (encrypted at rest, unconditionally deleted on disconnect per `SECURITY.md` Section 5.2) - no new credential-handling surface, despite storing more fields per credential than any prior connector.
- Unlike Discord/Slack/Telegram, there is no provider-side revocation call on disconnect: an IMAP/SMTP password is not a token an app can revoke on the mailbox owner's behalf - only the mailbox owner can rotate their own password. `SECURITY.md` Section 5.2's guarantee (our-side unusability) is unaffected; this is a property of the auth method, not a gap in this connector's disconnect flow.
- `mailparser`'s MIME parsing runs against untrusted, externally-supplied email content (the entire point of receiving mail) - using a well-maintained, widely-deployed parser here rather than hand-rolled parsing is itself a security-relevant choice, not just a convenience one, for exactly the class of risk `SECURITY.md`'s general parsing-of-untrusted-input posture would flag in a hand-rolled alternative.

## Decision Rule Applied

Same rule as every prior phase: implement now only what's more expensive to retrofit later; defer everything else to its already-assigned scope. No SDK interface change was implement-now-by-necessity here, because none was necessary at all - the cleanest confirmation yet that Sprint 1's design already anticipated this connector's shape. The one non-trivial new decision (thread resolution via References/In-Reply-To/Message-ID) was implemented for real rather than approximated, since a wrong thread-grouping heuristic would corrupt the Conversation model's meaning for this provider permanently, not just leave a documented gap.

## Future Work

- Complete a real IMAP mailbox connection (a real Gmail/Outlook/etc. account with an app password) and manually confirm a message round-trip through the Inbox UI (see "Not Verified Live" above) - the concrete next step before this connector is production-ready.
- Implement `Tag`/`MessageTag` (`DATABASE.md` Section 6.11) platform-wide, then map IMAP folders/labels onto it (Simplification #1) - a cross-connector feature, not Email-specific.
- Poll additional folders beyond `INBOX` once a real need for it is shown.
- Revisit the credential-storage split (Simplification #7) if `SecretRecord`'s payload size or the encrypted-blob-per-mailbox pattern ever becomes a real constraint.
- Complete Discord's and Slack's own live verifications (tracked separately, `STATUS.md` gaps #9/#14).

## Outcome

The fourth real connector exists, is certified against the same suite every connector is held to, and is the second connector in a row (after Slack) to require no `Connector` interface change - `ROADMAP.md`'s own checkpoint question is answered directly: **no SDK design flaw is indicated across four real connectors.** The SMTP half of this connector's live verification is the strongest live-verification bar any connector phase has cleared without needing an external account (a real send, against a real local SMTP server, independently confirmed delivered) - the IMAP receive half remains the one explicitly incomplete item, disclosed here rather than hidden, blocked on a real external mailbox the same way Discord and Slack are blocked on their own external setups.
