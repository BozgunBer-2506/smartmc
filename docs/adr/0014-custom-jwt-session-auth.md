# 0014 - Custom JWT/Session Authentication Instead of Auth.js; Direct Token Issuance for First-Party Clients

- Status: Accepted
- Date: 2026-07-18
- Deciders: Founder/CTO
- Related: [ARCHITECTURE.md](../ARCHITECTURE.md) Section 6, [API.md](../API.md) Section 7, [DATABASE.md](../DATABASE.md) Section 6.20, [SECURITY.md](../SECURITY.md) Section 4

## Context

`ARCHITECTURE.md` Section 6 (written during the initial architecture pass, before `DATABASE.md`'s session model was fully specified) names "Auth.js (NestJS-integrated)" as the authentication library. Two things discovered during Phase 2 implementation make that literally unbuildable as written:

1. **Auth.js has no NestJS integration.** It ships adapters for Next.js, SvelteKit, Express (community), and a framework-agnostic core (`@auth/core`), but its session/JWT model is designed around its own callback and adapter system, not around being embedded inside an arbitrary NestJS module.
2. **Auth.js's session model does not implement `DATABASE.md` Section 6.20's `family_id` reuse-detection scheme.** That design - a refresh token belongs to a rotation "family," and presenting an already-rotated token from that family revokes every session in it - is a specific, deliberate anti-theft mechanism `SECURITY.md` Section 4.3 requires. It is not a stock Auth.js feature. Implementing it would mean writing custom session logic underneath Auth.js anyway, at which point Auth.js contributes only its OAuth-provider plumbing while adding a framework-fit problem (issue 1) for no corresponding benefit yet (Phase 2 has no OAuth login, per `ROADMAP.md` Phase 2 scope discussed below).

Separately, `API.md` Section 7.1 describes first-party clients (our own web/desktop/mobile apps) using "OAuth2 Authorization Code flow with PKCE" against our own backend acting as its own Authorization Server - a full `/authorize` + `/token` exchange ceremony, the same shape a third-party OAuth client would use. This is the right target for Phase 18's marketplace (a real external client needs a real OAuth2 flow). Building that full Authorization Server ceremony now, for a same-origin first-party web app with no external client to protect against, adds real implementation surface (an authorization endpoint, redirect handling, PKCE challenge/verifier storage) that `ARCHITECTURE.md` Section 6's own simpler description ("sign-up/login... on success issue JWT + refresh cookie") and `SECURITY.md` Section 4.3's session-security spec don't actually assume or require.

## Decision

1. **Authentication is implemented as custom NestJS services and guards**, not via Auth.js: `argon2` for password hashing (Argon2id, per `SECURITY.md` Section 4.1, unchanged from the original decision), `@nestjs/jwt` for signing/verifying access tokens, and hand-written session/refresh-rotation logic implementing `DATABASE.md` Section 6.20's `family_id` design exactly. This is not a new technology relative to what the docs already specify in detail (Argon2id, JWT, family-based rotation) - it is the literal implementation of that specification, using standard, unsurprising NestJS building blocks instead of a library that cannot actually serve it.
2. **Phase 2 issues tokens directly** (`POST /v1/auth/login` returns an access token and sets a refresh cookie in one round trip), matching `ARCHITECTURE.md` Section 6's original flow description. The full OAuth2 Authorization Code + PKCE flow described in `API.md` Section 7.1 remains the target for Phase 18's third-party/marketplace OAuth clients, where a real external client and a real authorization/consent step exist - it is not retrofitted onto Phase 2's own first-party login, where it would add ceremony with no corresponding party to protect against.
3. **OAuth login (Google/GitHub), Passkeys (WebAuthn), and TOTP 2FA remain scoped to their originally-planned points on `ROADMAP.md`'s Phase 2 checklist** and are not implemented in this pass - Phase 2's Definition of Done covers email+password registration/login, JWT + refresh rotation + reuse detection, logout, session management, and workspace auto-creation only. The schema is shaped so these are additive later, not a redesign: `user_credentials.password_hash` is nullable (a future passkey-only or OAuth-only user needs no password row at all), and auth secrets stay in their own table, separate from `users`, exactly as `DATABASE.md` Section 6.3 already specified.

## Consequences

- `ARCHITECTURE.md` Section 6 is corrected (not redesigned) to name the actual mechanism - custom Argon2id/JWT/session implementation - instead of Auth.js, and to state plainly that Phase 2 uses direct token issuance while `API.md`'s OAuth2+PKCE flow is the Phase 18 target for external clients.
- No new runtime dependency category is introduced beyond what `SECURITY.md`/`DATABASE.md` already fully specified in behavior (Argon2id, JWT, Redis-backed rate limiting already present for BullMQ). `@nestjs/jwt`, `argon2`, `class-validator`/`class-transformer` (for RFC 7807-shaped validation errors), and `cookie-parser` are added - all standard, single-purpose libraries implementing already-documented behavior, not new architecture.
- `DATABASE.md`'s `family_id` reuse-detection design, which had no working implementation path under Auth.js, now has one that matches the schema exactly.
- Future OAuth/Passkey/2FA work (Phase 2's remaining checklist items) builds on this same session/JWT foundation rather than needing a second, Auth.js-shaped system reconciled with it later.
