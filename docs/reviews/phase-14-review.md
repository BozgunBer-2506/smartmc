# Phase 14 Review

```yaml
Title: phase-14-review.md
Version: 1.0
Status: Final
Owner: Architecture
Last Updated: 2026-07-29
Depends On:
  - ROADMAP.md
Related ADRs: []
```

A point-in-time comparison of the actual Phase 14 (Progressive Web App) implementation against `ROADMAP.md`'s redefined checklist (see the same-day roadmap-consistency fix, commit `41433f7`) and `docs/UI_GUIDE.md` Section 15. This phase was redefined the same session it was implemented - it originally specified a native React Native scaffold, which contradicted `PRODUCT.md`/`ARCHITECTURE.md`'s own existing "React Native is v2" framing and duplicated Phase 15's already-written PWA-first Desktop Strategy. That reconciliation is its own commit, not part of this review; this review covers only what was actually built once the roadmap was internally consistent.

---

## What Was Built

- **Web app manifest** (`apps/web/app/manifest.ts`) - Next.js's App Router manifest convention, auto-served at `/manifest.webmanifest` and auto-linked from every page. `display: "standalone"`, real theme/background colors, four icon entries (192/512, `any`/`maskable` purposes).
- **Generated icons, not placeholders** (`apps/web/app/icon.tsx`, `apple-icon.tsx`, `icon-192/route.tsx`, `icon-512/route.tsx`) - real PNGs rendered at request time via `next/og`'s `ImageResponse`, on-brand (the product's own dark background + accent color, a bold "S" mark), since no design tool or checked-in brand asset exists yet in this environment. Disclosed as a placeholder mark, not a final logo - see Simplifications.
- **Service worker** (`apps/web/public/sw.js`) - hand-written (no `next-pwa`/workbox dependency added), covering all three real requirements in one file: an offline app shell (cache-then-network for same-origin GETs, explicitly never intercepting cross-origin API calls - serving stale API data as live would violate this product's own "never show a misleading state" principle), Background Sync (`sync` event replays a queued outbox), and Web Push (`push`/`notificationclick` handlers showing and routing a real OS notification).
- **Install prompt** - `beforeinstallprompt` captured and `preventDefault()`-ed in `Inbox.tsx`, surfaced as a real "Install app" button in the header rather than relying on the browser's own generic UI, per `UI_GUIDE.md`'s general "give the user a real, in-context affordance" pattern applied here.
- **Background sync, client half** (`apps/web/lib/offline-queue.ts`) - an IndexedDB-backed outbox. `handleReply()` in `Inbox.tsx` now distinguishes a genuine network failure (`TypeError` from `fetch`, or `navigator.onLine === false`) from a real server-side error (e.g. a mock conversation's already-known 422) - only the former gets queued, with a toast confirming it, matching `UI_GUIDE.md` Section 15's "queues visibly, never a silent failure" requirement exactly. Falls back to an `online`-event-triggered flush for Safari/Firefox, which don't implement the Background Sync API.
- **Web Push, full stack**:
  - Self-generated VAPID key pair (`web-push`'s `generateVAPIDKeys()`) - no third-party push-service account (Firebase, etc.) needed; the browser's own built-in push service is reached directly via each subscription's endpoint URL.
  - `PushSubscription` model + `POST`/`DELETE /v1/push-subscriptions` (`apps/api/src/push`).
  - `PushService.sendToWorkspace()` wired into `RuleExecutionService`'s `notification.send` action port - every automation-triggered notification now also attempts real Web Push delivery, alongside the existing in-app WebSocket toast (Phase 3) and sound cue (Phase 11). A delivery failure (including a `404`/`410` from the push service meaning the subscription is dead) never breaks the underlying action - verified explicitly in `verify-phase14.mjs`.
  - Client subscribe flow (`apps/web/lib/push.ts`) - a real user-gesture-gated "Enable push" button (never auto-requested on load, per `UI_GUIDE.md`'s no-surprise-permission-prompts discipline), `Notification.requestPermission()` → `pushManager.subscribe()` → `POST /v1/push-subscriptions`.
- **Responsive UI - single-pane, stack-based navigation** (`UI_GUIDE.md` Section 15's explicit requirement): `Inbox.tsx`'s conversation list and message thread are now two full-screen views below the `md` breakpoint (720px), not both crammed onto one small screen - selecting a conversation hides the list and shows a "← Back to conversations" button; deselecting reverses it. This closes a real, previously-disclosed gap: the prior responsive CSS (from the Phase 9 UI audit) only stacked the two panes vertically, both always visible, which is not the stack-based push/pop navigation the spec actually calls for. `Rules.tsx` (Automations) also gets a lighter responsive pass (reduced padding, flex-wrap on toolbar rows) below the same breakpoint.
- **`scripts/verify-phase14.mjs`** - 12 real, end-to-end checks covering everything an HTTP script can actually exercise: the manifest's content and installability fields, both generated icons being real PNGs, the service worker being served as real JS (not an HTML fallback), the full subscribe → a rule's `notification.send` still succeeding despite an undeliverable subscription → unsubscribe lifecycle.

## What Was Not Built / Verified (the honest gap)

- **Real, on-brand icon artwork** - the generated "S" mark is a genuine, working placeholder (a real PNG, not a broken image), not a designed logo. `DESIGN_SYSTEM.md` has no finished brand mark to render yet.
- **Client-only behavior could not be verified end-to-end** - service worker registration itself actually succeeding in a real browser, the install prompt actually appearing and completing an install, a real offline reply actually queuing and later flushing, and a real push notification actually arriving and being clickable all require a real browser session. No browser-automation tool is available in this session (the same disclosed limitation every phase review since Phase 10 has carried) - the code paths are real and typecheck/lint clean, and `verify-phase14.mjs` exercises every backend-reachable piece, but the client-side runtime behavior itself is unverified. This is the single most important thing to close before calling Phase 14 done in practice, not just in code.
- **Cache-versioning across deploys** - the hand-written service worker's app-shell cache is best-effort runtime caching (cache what's actually been visited), not a versioned precache keyed to Next's hashed build-asset filenames. A real `next-pwa`/workbox integration would handle cache invalidation across deploys more robustly; this phase's simpler approach can serve a stale HTML shell referencing an old JS bundle hash immediately after a redeploy until the cache naturally refreshes. Disclosed, not silently accepted.
- **Responsive pass is Inbox + Automations only** - Search and the AI summarize/suggested-replies UI live inside `Inbox.tsx` already (no separate screen), so they inherit the same stack-nav fix; a dedicated pass specifically stress-testing those interactions at narrow widths (e.g. the suggested-replies button row, the AI summary card) wasn't done beyond the general toolbar-wrap treatment already applied.
- **Multi-device push subscription cleanup UI** - a user can subscribe from multiple browsers/devices (each gets its own `PushSubscription` row, correctly), but there's no UI to see or individually revoke them (only the browser's own unsubscribe flow, which correctly triggers this app's `DELETE` endpoint via `push.ts`, removes one).

## Verified

- `pnpm --filter @smc/scripts verify:phase14` - 12/12 passing, real end-to-end against the running API and web dev server.
- `verify:phase3` (11/11), `verify:phase9` (22/22), `verify:phase10` (21/21), `verify:phase11` (12/12), `verify:phase12` (9/9), `verify:phase13` (21/21), `verify:mvp-hardening` (13/13), and `verify:auth` (16/16) all re-run clean - this phase's backend changes are additive (a new `notification.send` side effect that swallows its own errors, a new module, a new model) and touch no existing write path's success/failure semantics.
- `pnpm lint`/`pnpm typecheck` pass clean across the whole monorepo (14 packages).
- Manual smoke test: `manifest.webmanifest`, `/icon-192`, `/icon-512`, and `/sw.js` were all curled directly against the dev server and inspected before the regression script was written, confirming real content before building a suite around it.

## Deliberate Simplifications (disclosed, not hidden)

| # | Finding | Reasoning | Resolution |
|---|---|---|---|
| 1 | Generated placeholder icon, not a real brand mark. | No design tool/asset exists in this environment yet - a real, working generated icon beats a broken image reference or a generic default. | **Accepted for now** - swap the `ImageResponse` JSX for real artwork whenever `DESIGN_SYSTEM.md` has one, zero other code change needed. |
| 2 | Hand-written service worker, no `next-pwa`/workbox. | Adding a build-time-bundled caching framework is a bigger commitment than this phase's three real requirements (offline shell, background sync, push) needed - a vanilla SW keeps the logic auditable in one file. | **Accepted**, real workbox integration is future work if cache-versioning-across-deploys becomes a real pain point. |
| 3 | App-shell cache is best-effort runtime caching, not a versioned precache. | Direct consequence of #2 - no build-time asset manifest to precache against without a bundler-integrated tool. | **Deferred**, same resolution as #2. |
| 4 | Client-only PWA behavior (SW registration, install flow, offline queue, push delivery) not verified in a real browser. | No browser-automation tool available this session. | **Should be done before this phase is considered fully verified in practice** - the single most important follow-up, flagged clearly rather than assumed working because the code compiles. |
| 5 | Push notifications are workspace-wide (every subscribed device across every member), not per-user-targeted. | Matches `Notification`'s own existing workspace-wide scope exactly (already disclosed in `docs/reviews/phase-11-review.md` as pending real per-user targeting) - Web Push delivery inherits the same limitation, not a new one. | **Deferred**, same tracked gap as Phase 11. |

## Already-Tracked Gaps, Still Open (not new)

| # | Finding | First noted |
|---|---|---|
| 6 | `packages/ui`/`apps/marketing-site` theme consolidation. | STATUS.md gap #12 |
| 7 | No staging environment. | STATUS.md gap #13 |
| 8 | Discord/Slack/Email connectors remain unverified live. | STATUS.md gaps #9/#14/#16 |
| 9 | Prior phases' UI (Rules, notification preferences, search, AI) still not click-tested in a real browser - Phase 14 adds the same limitation for its own new surfaces (install, push, offline). | STATUS.md gaps #20/#22/#24/#26 |
| 10 | No general rate limiting, no real cursor pagination. | STATUS.md gaps #27/#28, now owned by Phase 20 |

**TODOs**: grepped `apps/web/app/manifest.ts`, `apps/web/app/icon*`, `apps/web/public/sw.js`, `apps/web/lib/offline-queue.ts`, `apps/web/lib/push.ts`, `apps/api/src/push` for `TODO`/`FIXME`/`HACK`/`XXX` - zero matches, consistent with every prior phase.

## Security Considerations

- `PushController`'s endpoints are `JwtAuthGuard`-protected and workspace-scoped (a subscription is always created against `claims.workspaceId`/`claims.sub`, never a caller-supplied id).
- VAPID private key lives in `apps/api/.env` (gitignored, confirmed via `git check-ignore`), never committed - `.env.example` documents the variable name with a generation command, not a real key.
- The service worker's fetch handler explicitly refuses to intercept cross-origin requests (`if (url.origin !== self.location.origin) return`) - it cannot accidentally cache or replay an API response as if it were live data, and cannot be used to man-in-the-middle a request to a different origin.
- A push payload is only ever `{title, body, url}` - the same shape `notification.send`'s existing params already produce, no new data surface exposed to the push service beyond what was already sent to the in-app notification.

## Decision Rule Applied

Same rule as every prior phase: implement now what's real and testable without a resource this environment doesn't have (a self-generated VAPID pair needs no external account, unlike a real design asset or a browser-automation tool); disclose what genuinely can't be verified here rather than asserting it works. The generated icon and the hand-written service worker are both "smallest real version" choices in the same spirit as `HeuristicAIProvider` (Phase 13) and `MockConnector` - real, working, honestly scoped, not a placeholder that throws.

## Future Work

- Real brand icon artwork, once `DESIGN_SYSTEM.md` has one (Simplification #1).
- A real click-through of every new PWA surface in an actual browser - install, push permission/delivery, offline queue/replay (Simplification #4) - the top follow-up priority.
- `next-pwa`/workbox integration if cache-versioning-across-deploys becomes a real problem (Simplifications #2/#3).
- Per-user push targeting, once `Notification`'s own per-user targeting (Phase 11's tracked gap) is built.
- A UI surface for viewing/revoking individual push subscriptions across devices.

## Outcome

Phase 14 ships a real Progressive Web App: an installable manifest with generated icons, a working service worker covering offline shell + background sync + push in one auditable file, a full Web Push stack from VAPID keys through to a subscribed browser (verified through the API layer), and the actual stack-based mobile navigation `UI_GUIDE.md` Section 15 specifies - closing a real gap the Phase 9 UI audit's simpler "just stack vertically" fix had left open. What remains is exactly what a backend-only regression suite structurally cannot prove: that all of this behaves correctly in a real browser, which is the honest, explicit next step before this phase is more than code-complete.
