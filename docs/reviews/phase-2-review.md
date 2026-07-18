# Phase 2 Review

```yaml
Title: phase-2-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-18
Depends On:
  - ROADMAP.md
Related ADRs:
  - ADR-0007
  - ADR-0014
```

A point-in-time comparison of the actual Phase 2 (Authentication) implementation against `PRODUCT.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `SECURITY.md`, all ADRs current at the time, and `ROADMAP.md` - the second in the standing per-phase review practice (`docs/reviews/phase-1-review.md` was the first). Per explicit direction for this phase: implementation-first, no architecture redesign, no new documentation beyond an ADR where a genuine architectural decision required one. This report follows that same discipline - it records what was found and decided, it does not propose new work beyond what's already on `ROADMAP.md`.

---

## What Was Built

`POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `POST /v1/auth/logout-all`, `GET /v1/auth/sessions`, `GET /v1/users/me` - Argon2id password hashing, HIBP breach-checking, Redis-backed account lockout, JWT access tokens (15 min), rotating refresh tokens with `family_id`-based reuse detection (`DATABASE.md` Section 6.20), `JwtAuthGuard` + `RolesGuard` (owner/admin/member RBAC foundation), RFC 7807-shaped errors for every auth failure mode, audit logging for every auth event, and automatic Organization+Workspace creation on registration. All verified live via `pnpm --filter @smc/scripts verify:auth` (16/16 checks) plus direct Postgres inspection of the reuse-detection revocation cascade - not just typechecked.

## The One Real Architectural Correction

`ARCHITECTURE.md` Section 6 named "Auth.js (NestJS-integrated)" - which does not exist as a real integration and cannot implement `DATABASE.md`'s `family_id` reuse-detection design. This was corrected via [ADR-0014](adr/0014-custom-jwt-session-auth.md), not silently worked around: authentication is a custom implementation of the exact behavior `ARCHITECTURE.md`/`SECURITY.md` already specified (Argon2id, 15-min JWT, rotating refresh, family-based reuse detection), using standard NestJS building blocks instead of a library that couldn't serve it. The ADR also records that Phase 2 uses direct token issuance rather than `API.md` Section 7.1's OAuth2 Authorization Code + PKCE flow, which remains the correct target for Phase 18's real external/marketplace clients - not retrofitted onto a same-origin first-party login with no external party to protect against.

## Deliberately Deferred (ROADMAP.md Phase 2 checklist items left unchecked, not silently dropped)

| Item | Status |
|---|---|
| OAuth (Google, GitHub) | Not implemented - no external client exists yet to justify it ahead of need |
| Passkeys (WebAuthn) | Not implemented - schema is ready (`user_credentials.password_hash` nullable), per explicit direction to make this additive later |
| 2FA (TOTP) | Not implemented - `user_credentials.totp_secret` column reserved |
| User settings (`PATCH /v1/users/me`, password/2FA change endpoints) | Not implemented - these manage features (password change flow, 2FA) that don't exist yet either |
| `POST /v1/organizations`, `POST /v1/workspaces` as public endpoints (`API.md` Section 10.1) | Not implemented as endpoints - organization/workspace creation happens as an internal side effect of registration only. Full CRUD is `ROADMAP.md` Phase 3's "Workspace/account model" item explicitly, not Phase 2's |
| Login UI | Not built - the Definition of Done was stated entirely in API-observable terms, matching Phase 1's precedent (verification via scripts, not a UI) |
| Email verification | Not implemented - not present anywhere in `ROADMAP.md`'s Phase 2 checklist or `SECURITY.md`'s Section 4, so treated as out of current scope rather than assumed |

## New Findings From This Review

### Deliberate simplifications (disclosed, not hidden)

| # | Finding | Reasoning | Resolution |
|---|---|---|---|
| 1 | `DATABASE.md` Section 6.3 suggests Postgres `citext` for case-insensitive email uniqueness; implemented instead as application-layer lowercase normalization (`normalizeEmail()`, applied on every read/write path in `AuthService`). | Avoids provisioning a Postgres extension for a property achievable at the application layer with less operational surface. | **Accepted with a named residual risk**: `citext` closes case-insensitivity at the database level - any future code path that queries `users.email` directly without going through `normalizeEmail()` first (a raw SQL query, an admin tool) would not get case-insensitive matching automatically. Flagged as a candidate for a real hardening pass, not dismissed as equivalent. |
| 2 | Login does not use a constant-time dummy-hash comparison for unknown emails - an unknown email short-circuits before any Argon2 verify call. | `SECURITY.md` Section 4 does not list timing-attack resistance among its stated requirements (breach-check, lockout, Argon2id, length are explicit; this isn't). | **Deferred**, not a documented requirement - noted here so it's a deliberate omission on record, not a rediscovery later. |
| 3 | `req.ip` is used directly for session/audit-log IP addresses with no `trust proxy` configuration. | Correct for direct local-dev access; behind a future reverse proxy/load balancer it would log the proxy's IP, not the real client's. | **Deferred** to whenever a real reverse proxy sits in front of the API - premature to configure against infrastructure that doesn't exist yet. |
| 4 | `GET /v1/auth/sessions` returns raw `ipAddress`/`userAgent`, not a parsed device name or geolocation approximation. | `SECURITY.md` Section 4.3 mentions "device, location approximation" as the session-visibility surface; this is the raw data that would feed such a display, not the display itself. | **Deferred** - a UI/parsing concern, not a backend gap; the raw data needed is already captured and available. |
| 5 | Argon2id uses library default memory/time-cost parameters, not explicitly tuned. | `SECURITY.md` Section 4.1 specifies the algorithm (Argon2id), not specific cost parameters. | **Deferred** to a pre-production security review, where real tuning against real infrastructure capacity is meaningful; tuning against a laptop's dev environment would be premature. |
| 6 | A role change (e.g., a user promoted from member to admin) does not take effect until their current access token expires (up to 15 minutes) or they refresh. | A direct, understood consequence of embedding `role` in the JWT (avoiding a DB round-trip per request within the token's short life) - stated as a design tradeoff in `session.service.ts`'s own comments, not an oversight. | **Accepted** - 15 minutes is the same window `ARCHITECTURE.md`/`SECURITY.md` already chose for access-token life generally; no new exposure introduced. |

### Already-tracked gaps, still open (not new, restated because they're now load-bearing for real auth flows)

| # | Finding | First noted |
|---|---|---|
| 7 | `audit_logs` has no Postgres-role-level `REVOKE UPDATE, DELETE` enforcement (`DATABASE.md` Section 21) - matters more now that real auth events (not just mock-connector test data) are being audited. | Phase 1 review, item 11 |
| 8 | No DB role separation / RLS. | Phase 1 review, items 7/11 |
| 9 | `SECURITY.md` Section 4.4's separate admin authentication tier is not applicable yet - no admin surface exists to protect. | Not a gap - correctly out of scope until an admin surface exists (`ROADMAP.md` Phase 17) |

**TODOs**: none - grepped `apps/` and `packages/` for `TODO`/`FIXME`/`HACK`/`XXX`, zero matches, consistent with Phase 1.

**Confirmed on-track, no deviation**: Argon2id (never bcrypt/SHA-family), the full `family_id` rotation + reuse-detection design (verified live, including the family-wide revocation cascade on reuse), RFC 7807 error shape for every auth failure mode, audit logging for every documented auth event (`ARCHITECTURE.md` Section 6 step 5's list), the owner/admin/member RBAC foundation, workspace auto-creation on registration (`API.md` Section 10.1), and UUIDv7 for every new row (ADR-0007).

## Decision Rule Applied

Same rule as Phase 1: implement now only what's more expensive to retrofit later; defer everything else to its already-assigned phase. This phase's one "implement now" item was the ADR-0014 correction itself (the docs named something unbuildable - fixing the record was not optional). Every other finding above was either already correctly scoped out by `ROADMAP.md`'s own Phase 2 checklist or a disclosed, reasoned simplification - nothing was pulled forward, nothing was silently dropped.

## Outcome

Backend authentication is complete and verified live. One ADR recorded a real correction to previously-inaccurate documentation. Six deliberate simplifications and three already-tracked gaps are on record with explicit reasoning, not hidden. Tagged `v0.2.0-phase2`.
