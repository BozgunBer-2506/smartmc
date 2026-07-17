# Smart Message Center - API.md

```yaml
Title: API.md
Version: 1.0
Status: Approved
Owner: Architecture
Last Updated: 2026-07-17
Depends On:
  - PRODUCT.md
  - ARCHITECTURE.md
  - DATABASE.md
Related ADRs:
  - ADR-0003
  - ADR-0006
```

Author role: Principal API Architect
Scope: the API as product contract - the thing every client (our own web/desktop/mobile apps, third-party integrations, and eventually the Phase 18 marketplace) depends on for a decade. No controller code, no OpenAPI YAML - this document is the contract those artifacts will later implement.

---

## 0. How to Read This Document

This is organized around **product capabilities**, not resources-as-CRUD and not NestJS controllers. Each capability group (Inbox, Contacts, Automation, Notifications, Connectors, AI, Billing, Organization/Workspace, Admin) exists because a persona in PRODUCT.md needs it, and each section states which persona/problem it serves before describing shape. An endpoint that doesn't trace back to a documented capability doesn't belong here - this mirrors ROADMAP.md's working rule that no feature ships undocumented.

**Design horizon: 10+ years.** Every decision below is evaluated against "will this still make sense when Smart Message Center has 40 connectors, a marketplace, and enterprise customers with custom retention policies" - not just against the MVP's 4 connectors. Where MVP scope is narrower than the contract allows, that's stated explicitly; the contract itself is not narrowed to match MVP, because narrowing the contract is what causes breaking changes later.

---

## 1. API Philosophy

1. **The API is a product, not an implementation detail.** It will be consumed by our own frontend from day one and by third-party developers from Phase 18 onward (per ROADMAP.md). Designing it "good enough for our own client" and tightening it later for external consumers is backwards - external-consumer discipline (stability, clear errors, no leaking internal implementation) starts at MVP, even though no external consumer exists yet.
2. **REST is the default; GraphQL is a deliberate, scoped exception**, not a parallel universe. This is a direct extension of ARCHITECTURE.md's original "REST + GraphQL" decision, now made precise: REST owns commands, resource CRUD, auth, webhooks, and anything with side effects; GraphQL owns exactly two things where its aggregation model earns its cost - the unified inbox read path and the rule-builder schema introspection (Section 6). See ADR-0003 for the full reasoning (docs/adr/0003-rest-over-graphql-by-default.md).
3. **Every breaking change is a new major version, never a silent behavior change.** A client written against v1 on day one must keep working exactly as documented until v1 is formally sunset (Section 3), even if that takes years. This is the single most important promise this document makes, because the cost of breaking it compounds - every third-party integration, every automation webhook consumer, every long-lived API key becomes a liability the moment "REST API" stops meaning "stable contract."
4. **Errors are data, not strings.** Every error response is machine-parseable (RFC 7807, Section 5) so a client can build real behavior on top of failures (retry, prompt for reauth, show a specific message) instead of pattern-matching human-readable text.
5. **Idempotency and retries are first-class, not an afterthought.** A messaging product's API will be called by flaky mobile networks, retried webhooks, and automation systems that fire twice under load - the contract assumes retries happen and is designed so retrying is always safe (Section 12).
6. **The API never requires trusting a black box.** Every automation-adjacent endpoint (Section 8) supports a dry-run/inspection mode, mirroring PRODUCT.md's UI Principle that automations must be inspectable, not magical - this principle applies to the API surface as much as the UI.

---

## 2. Resource Naming Conventions

| Rule | Convention | Example |
|---|---|---|
| Base path | `https://api.smartmessagecenter.com/v{n}/` | `https://api.smartmessagecenter.com/v1/` |
| Resources | plural nouns, kebab-case for multi-word | `/conversations`, `/linked-accounts`, `/rule-executions` |
| Nesting | max one level of nesting for ownership-implying reads; cross-cutting access goes through query params, not deep nesting | `/conversations/{id}/messages` (owned) but `/messages?workspaceId=` (not `/workspaces/{id}/conversations/{id}/messages/{id}/attachments/{id}`) |
| Actions that aren't pure CRUD | a sub-resource verb-noun, not a verb on the resource itself | `POST /rules/{id}/test-runs` (not `POST /rules/{id}/test`) - keeps every endpoint a resource, even "actions," which keeps caching/idempotency semantics uniform |
| IDs in paths | UUID, matching DATABASE.md's identifier strategy exactly | `/contacts/9c1b1e2e-...` |
| Query params | camelCase, matches JSON body casing for consistency across the whole contract | `?sortBy=lastMessageAt&order=desc` |
| Response envelope | no unnecessary envelope for single resources; a defined envelope only for collections (Section 4) | single: the resource object directly; collection: `{ data: [...], pagination: {...} }` |

**Why plural, kebab-case-for-multiword resources, one-level nesting max**: this is closer to how the API will actually be discovered by third-party developers (Phase 18) than deep nesting - deep paths are a well-known long-term maintenance trap (a resource's "true" location becomes ambiguous once it can be reached two different ways), and one-level nesting sidesteps that without losing the readability benefit nesting exists for.

---

## 3. Versioning Strategy

- **URI versioning** (`/v1/...`), not header-based (`Accept: application/vnd.smc.v1+json`). **Why**: header versioning is more "correct" REST purism, but URI versioning is dramatically easier for third-party developers to discover, bookmark, and debug (curl a URL, see the version, done) - and this API's actual audience (Phase 18 marketplace developers, automation-tool integrators) skews toward "get it working quickly," not REST purism. This is recorded as ADR-0006.
- **A major version is a stability contract, not a release train.** `v1` does not get new incompatible fields, removed fields, or changed semantics - ever. New capabilities within `v1`'s lifetime are added as strictly additive changes (new optional fields, new endpoints, new enum values a well-behaved client already ignores gracefully).
- **What counts as breaking** (forces a `v2`, or a versioned sub-resource - see below): removing/renaming a field, changing a field's type or meaning, changing default behavior, tightening validation on existing input, changing an error code's meaning, removing an enum value. **What does not count as breaking**: adding an optional field, adding a new endpoint, adding a new enum value (clients are contractually required to handle unknown enum values gracefully - stated explicitly in Section 5's error model and in client SDK guidance).
- **Deprecation lifecycle**: a field/endpoint marked deprecated (via a `Deprecation` HTTP header per RFC 8594, plus documentation) must remain functional for a minimum of 12 months from the deprecation announcement before removal in a subsequent major version - this window exists specifically because long-lived automation rules and webhook integrations (this product's own core feature) are exactly the kind of client that breaks silently and expensively on short deprecation windows.
- **GraphQL versioning is different by nature**: the GraphQL schema (Section 6) evolves via field-level deprecation (`@deprecated(reason: ...)`) rather than URI versions, which is the idiomatic GraphQL approach - but the same 12-month minimum deprecation window applies before a field is actually removed from the schema.
- **Sub-resource versioning escape hatch**: if one specific endpoint needs to evolve faster than the rest of `v1` (e.g. the AI-features endpoints, which will genuinely change shape faster than core messaging as models/capabilities evolve), it can carry its own version segment (`/v1/ai/v2/summaries`) rather than forcing a whole-API major version bump for one fast-moving capability area. Used sparingly - Section 10 (AI APIs) is the primary anticipated user of this escape hatch.

---

## 4. Pagination, Filtering, Sorting, Search

**Pagination: cursor-based, everywhere, no offset pagination anywhere in the contract.**

Request: `GET /v1/conversations?limit=25&cursor={opaque_cursor}`
Response envelope:
```
{
  "data": [ ... ],
  "pagination": {
    "nextCursor": "opaque-string-or-null",
    "hasMore": true
  }
}
```

**Why cursor-only, never offset (`?page=3&pageSize=25`), even at MVP scale where offset would "work fine"**: offset pagination silently produces wrong results under concurrent writes (a new message arriving shifts every subsequent page by one, causing skipped or duplicated rows) - and this API's dominant use case, an actively-updating inbox, is precisely the scenario where that failure mode is guaranteed to happen constantly, not a rare edge case. Cursor pagination also scales correctly regardless of how deep into a result set a client pages, where offset pagination gets slower the deeper it goes (`OFFSET 100000` still has to scan/skip 100,000 rows). The cursor is an opaque, signed token encoding the last-seen sort key(s) - clients must never parse or construct it themselves, which is what keeps the underlying sort/index strategy free to change later without breaking clients (a direct application of Section 3's versioning philosophy: internal implementation detail, not contract).

**Filtering**: query params, one per filterable field, combined with implicit AND: `GET /v1/conversations?isArchived=false&providerId=telegram&contactId={uuid}`. Range filters use a `[gte]`/`[lte]` suffix convention: `?lastMessageAt[gte]=2026-01-01T00:00:00Z`. No bespoke query language (no Mongo-style operators, no free-form filter DSL) in REST - if filtering needs outgrow flat query params, that need routes to GraphQL (Section 6) or a dedicated search endpoint (below), rather than growing REST's filter syntax into an ad hoc query language over time.

**Sorting**: `?sortBy=lastMessageAt&order=desc`. A fixed, documented allowlist of sortable fields per resource (not "any field") - unrestricted sorting on an arbitrary column is both a performance risk (no guaranteed index) and an internal-schema leak (Section 2's "no implementation detail leakage" principle).

**Search**: a distinct endpoint per searchable domain, not a filter param - `GET /v1/search/messages?q=invoice`, `GET /v1/search/contacts?q=deniz`. **Why a separate endpoint instead of `?q=` bolted onto the list endpoint**: search (full-text ranking, relevance-ordering, per DATABASE.md Section 14) has fundamentally different pagination/ranking semantics than a plain filtered list, and conflating them means every list endpoint has to carry search's complexity even when unused. A future `GET /v1/search` cross-domain endpoint (searching messages + contacts + files at once, matching PRODUCT.md's cross-channel search vision) is a natural additive endpoint under this same pattern, not a redesign.

---

## 5. Error Model (RFC 7807)

Every error response, across REST and (adapted) GraphQL, uses the RFC 7807 `application/problem+json` shape:

```
{
  "type": "https://docs.smartmessagecenter.com/errors/rule-conflict",
  "title": "Rule conflicts with an existing rule",
  "status": 409,
  "detail": "This rule's trigger and conditions exactly match rule a1b2c3d4, which is still enabled.",
  "instance": "/v1/rules/e5f6...",
  "code": "RULE_CONFLICT",
  "traceId": "01977f3e-...",
  "errors": null
}
```

- `type` is a dereferenceable URL to human documentation for that specific error - not a generic `about:blank`. This is what makes the error model genuinely useful to a third-party developer years from now, not just spec-compliant.
- `code` is a stable, machine-matchable string (`RULE_CONFLICT`, `INSUFFICIENT_AI_CREDITS`, `LINKED_ACCOUNT_REAUTH_REQUIRED`) - this is the field client code actually branches on, since `status` alone (409) is too coarse and `type`/`title` are for humans. **`code` values are part of the versioned contract** (Section 3) - a `code` is never repurposed to mean something else, only added to.
- `traceId` correlates the error to server-side logs/OpenTelemetry traces (per ARCHITECTURE.md's observability stack) - included on every error response, always, so a support engineer can find the exact request from a user-reported error instantly.
- `errors` (nullable array) carries field-level validation detail for `400`-class requests: `[{ "field": "trigger.type", "code": "INVALID_ENUM_VALUE", "message": "..." }]` - kept separate from the top-level `detail` string so clients can render per-field form errors without string-parsing.
- **Status code discipline**: `400` malformed/invalid input, `401` missing/invalid auth, `403` authenticated but not permitted, `404` not found (or not visible to this caller - see below), `409` conflict (optimistic lock failure, duplicate resource, rule conflict), `422` semantically invalid (well-formed but violates a business rule), `429` rate limited (Section 9), `5xx` genuine server faults.
- **`404` vs `403` policy**: for resources where existence itself is sensitive information (e.g. another workspace's conversation), an unauthorized request returns `404`, not `403` - revealing "this exists but you can't see it" is itself a data leak in a multi-tenant system. For resources where existence isn't sensitive (e.g. a disabled feature flag), `403` is used normally. This distinction is deliberate per-resource, documented at the resource level, not left to individual endpoint implementers to guess.

---

## 6. REST vs. GraphQL: Where Each Applies

**REST owns**: authentication, all mutations/commands (send message, create rule, connect account), all resource CRUD, webhooks, admin/billing/organization management - anything with a side effect, or anything a third-party integration/webhook consumer needs to reason about with standard HTTP tooling.

**GraphQL owns exactly two capabilities**, both chosen because they have a genuinely different shape than REST's resource-CRUD model, not because "GraphQL is more modern":

1. **The unified inbox read path** (`query inbox`, `query conversation`) - the client needs conversations + last message preview + contact + tags + unread state in one shaped response, and the exact shape needed varies by screen (a conversation list needs less than an open conversation view). Modeling this as REST would mean either chronic over-fetching (a fixed, wide response every screen pays for) or a proliferation of narrow, screen-specific REST endpoints (`/inbox-list-view`, `/inbox-detail-view`) that duplicate logic and multiply the surface area to keep stable under Section 3's versioning discipline. GraphQL's client-specified shape solves exactly this problem, for exactly this read path.
2. **Rule-builder schema introspection** (`query ruleBuilderSchema`) - the visual automation builder (PRODUCT.md/ROADMAP.md Phase 10) needs to discover, at runtime, the full catalog of available trigger types, condition types, action types, and their parameter schemas, so the no-code UI can render itself without a hardcoded, redeployed-every-time list. This is precisely the kind of self-describing, evolving-shape query GraphQL's introspection model was built for, and it maps directly onto Section 8's `jsonb`-driven rule design in DATABASE.md - the two decisions reinforce each other.

**Explicitly NOT GraphQL, and why, even though it would "work"**: billing, admin, connector management, and webhooks are all deliberately kept REST-only. Billing/admin are low-query-diversity, high-stakes-mutation domains where REST's explicit, cacheable, individually-versionable endpoints are a better fit than GraphQL's single-endpoint-many-shapes model - and keeping GraphQL's footprint deliberately narrow (2 domains, not "REST vs GraphQL everywhere, pick per team preference") is itself the point: it keeps the API surface predictable for third-party developers, who can safely assume "REST unless I'm building an inbox UI or a rule builder."

**Subscriptions** (GraphQL): `subscription messageReceived`, `subscription notificationCreated` - layered on top of the WebSocket transport (Section 11), not a separate mechanism.

---

## 7. Authentication & Authorization

### 7.1 Authentication (item: OAuth2, JWT)

Two distinct authentication paths for two distinct classes of caller, matching ARCHITECTURE.md section 6:

1. **First-party clients (our own web/desktop/mobile apps)**: OAuth2 Authorization Code flow with PKCE (even for our own first-party clients - **why PKCE even first-party**: it costs nothing extra to implement uniformly, and it means the desktop/mobile apps, which cannot safely hold a client secret, use the exact same flow as any future third-party OAuth client, rather than a special-cased "trusted first-party" shortcut that then has to be maintained forever as a second code path). Successful auth issues a short-lived JWT access token (15 min) plus a rotating refresh token (httpOnly cookie for web; secure storage for desktop/mobile), exactly per ARCHITECTURE.md section 6 and DATABASE.md's `sessions`/`family_id` design.
2. **Third-party / API integrations (Phase 18+, and power users per PRODUCT.md's Power User persona)**: `ApiKey` bearer tokens (DATABASE.md Section 6.19) for server-to-server use, or full OAuth2 Authorization Code flow for third-party apps acting on behalf of a user (the marketplace scenario) - the same OAuth2 server, different client registration and consent screen.

**JWT contents**: `sub` (user id), `workspaceId` (active workspace context), `orgId`, `scopes` (array), `exp`, `iat`, standard claims only - **deliberately no PII beyond user id in the token itself** (no email, no display name) so a leaked/logged JWT doesn't itself constitute a PII leak, consistent with DATABASE.md's data-minimization stance.

**Scopes**: OAuth2 scopes are the authorization currency for third-party access - `messages:read`, `messages:write`, `rules:read`, `rules:write`, `contacts:read`, `webhooks:manage`, etc. First-party clients implicitly receive the full scope set the user's role permits; third-party OAuth clients request a specific scope subset, shown to the user on the consent screen. **Why scopes now, even though Phase 18's marketplace is years out**: retrofitting scoped authorization onto an API that started as "if you're authenticated, you can do everything the UI can" is a breaking, trust-sensitive migration - defining the scope model at MVP, even with first-party clients using an "all scopes" shortcut internally, means Phase 18 is additive (register third-party clients, enforce the scopes that already exist) rather than a redesign.

### 7.2 Authorization

- **Role-based** at the Workspace level (`owner`, `admin`, `member` - DATABASE.md `workspace_members.role`), checked on every mutating request.
- **Resource ownership** as a second, independent check beneath role: a `member` can act on resources they created or are assigned to; broader access requires `admin`/`owner` - enforced in application logic (repository layer), with RLS as the defense-in-depth layer once enabled (DATABASE.md Section 10).
- **API keys carry their own scopes**, independent of the creating user's role, and are always scoped to exactly one workspace, never cross-workspace - a leaked API key's blast radius is one workspace's data, never more.

---

## 8. Idempotency, Optimistic Concurrency, Retry Strategy

**Idempotency (item 12)**: every `POST` that creates a resource with a real-world side effect (send a message, create a rule, trigger a webhook test) accepts an `Idempotency-Key` header (client-generated UUID). The server stores the key alongside the resulting response for 24 hours; a retried request with the same key returns the original response without re-executing the side effect. **Why 24 hours specifically**: long enough to cover realistic retry windows (a mobile client retrying after being offline for hours, a queue-based automation retry after a provider outage) without keeping an unbounded idempotency log. This directly extends ARCHITECTURE.md's event-flow idempotency design (keyed on `Message.id`) to the API surface itself, so the same guarantee holds whether a duplicate arrives from a flaky client or a flaky connector worker.

**Optimistic concurrency (item: optimistic concurrency)**: resources with a `version` column in DATABASE.md (`rules`, `subscriptions`) expose it as an `ETag` response header; mutating requests must send `If-Match: {etag}`. A mismatch returns `409 Conflict` with `code: OPTIMISTIC_LOCK_FAILURE`, and the response body includes the current server-side version so the client can re-fetch, show a merge/conflict UI, and retry - this is the API-level expression of DATABASE.md Section 9's optimistic locking, using standard HTTP conditional-request semantics (`ETag`/`If-Match`) rather than a bespoke `version` body field, because conditional requests are a well-understood HTTP idiom any client library already knows how to use.

**Retry strategy**: every response includes a `Retry-After` header on `429` and `503` responses. Clients (including our own) are expected to implement exponential backoff with jitter; this is documented contract behavior, not just a suggestion, because the automation engine itself (Phase 10) is one of the API's own heaviest retrying clients (Section 8 of the automation-execution pipeline) and needs the same discipline the docs ask third parties for.

---

## 9. Rate Limiting

- **Per-credential, sliding window**, enforced via Redis token buckets (ARCHITECTURE.md section 6's existing infra choice, reused here rather than introducing a new mechanism).
- Response headers on every request, not just when limited: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` - so well-behaved clients can self-throttle before hitting `429`, rather than discovering the limit only by being rejected.
- **Tiered by plan** (mirrors PRODUCT.md's Pricing): Free tier gets a conservative default (e.g. 60 req/min); Pro/Business/Enterprise get progressively higher limits; Enterprise can negotiate custom limits - encoded as data on `billing_plans` (DATABASE.md Section 6.16), not hardcoded, for the same reason pricing itself is data.
- **Separate, tighter limits for expensive endpoints** (AI endpoints, bulk export) independent of the general per-credential limit - a single global rate limit would let one expensive endpoint's cost hide behind a budget sized for cheap ones.
- Webhook delivery (outbound, Section 13) is rate-limited per-target-URL independently, to avoid one workspace's misconfigured webhook endpoint consuming shared outbound-delivery capacity.

---

## 10. API Groups (Capabilities)

Each group states the persona/problem it serves (traced to PRODUCT.md), then its endpoints. Every endpoint entry covers: why it exists, request shape, response shape, permissions, possible errors, and future-compatibility notes. Endpoints are illustrative of the group's contract, not an exhaustive line-by-line CRUD listing (standard CRUD on a resource is assumed once the resource and its non-obvious endpoints are specified).

### 10.1 Organization & Workspace APIs (items 33-34)

Serves: every persona, as the tenancy root (DATABASE.md Section 4).

**`POST /v1/organizations`** - Why: account creation always creates an Organization first (even solo signups get one automatically, per DATABASE.md). Request: `{ name }`. Response: `Organization` + an auto-created default `Workspace`. Permissions: any authenticated user, or public during signup. Errors: `422 VALIDATION_ERROR` on missing name. Future compatibility: additional signup-time fields (referral source, intended use) are additive.

**`POST /v1/workspaces`** - Why: PRODUCT.md's Business tier and future agency use cases need multiple workspaces per organization (DATABASE.md Section 4's explicit design headroom). Request: `{ organizationId, name, timezone }`. Response: `Workspace`. Permissions: `owner`/`admin` on the parent organization. Errors: `403` if not org owner/admin, `422` on invalid timezone.

**`GET /v1/workspaces/{id}/members`**, **`POST /v1/workspaces/{id}/members`** (invite), **`DELETE /v1/workspaces/{id}/members/{memberId}`** - Why: team membership management, the structural growth loop described in PRODUCT.md's Viral Features. Permissions: `admin`/`owner` to invite/remove; any member to list. Errors: `409 MEMBER_ALREADY_EXISTS` on duplicate invite, `403` if the actor lacks admin/owner role, `422` if removing the last owner (a workspace can never end up ownerless).

### 10.2 User APIs (item: User APIs)

**`GET /v1/users/me`** - Why: every client needs "who am I" on load. Response: `User` (no auth secrets - DATABASE.md's `user_credentials` split is mirrored at the API layer by simply never including those fields in any User representation, ever, not even to the user themselves via this endpoint - password/2FA changes go through dedicated endpoints below). Permissions: any authenticated user, self only.

**`PATCH /v1/users/me`** - profile fields only (display name, avatar, timezone preference). Errors: `422` on invalid avatar URL/size.

**`POST /v1/users/me/password`**, **`POST /v1/users/me/2fa`**, **`POST /v1/users/me/passkeys`** - deliberately separate, narrowly-scoped endpoints for security-sensitive changes rather than allowing these fields through the general `PATCH /users/me` - **why separate**: security-sensitive mutations benefit from stricter rate limiting, mandatory reauth-confirmation, and dedicated audit log entries (DATABASE.md `audit_logs`), all of which are easier to guarantee on a narrow endpoint than to conditionally apply within a general-purpose profile update.

### 10.3 Inbox / Conversation / Message APIs (items 23-26, 18)

Serves: the core unified-inbox job (PRODUCT.md problems #1-30). Primarily GraphQL for reads (Section 6), REST for writes.

**`POST /v1/conversations/{id}/messages`** - Why: sending a message is the platform's most fundamental write. Request: `{ body, bodyFormat, attachmentIds?, idempotencyKey }` (also via header, Section 8). Response: `Message` with `status: queued`, `202 Accepted` (not `201`) - **why 202, not 201**: the message is not actually delivered yet at response time (ARCHITECTURE.md's event flow routes it through a connector worker asynchronously); returning `201` would falsely imply completed delivery. The client is expected to observe delivery via WebSocket (Section 11) or by polling `GET /v1/messages/{id}`. Permissions: workspace member with `messages:write` scope, and must be a participant-reachable conversation. Errors: `404` if conversation not visible, `422 LINKED_ACCOUNT_REAUTH_REQUIRED` if the underlying connector account needs reauthorization, `429` per-connector-provider rate limits (Telegram/Slack's own limits, surfaced through ours). Future compatibility: `bodyFormat` enum is additive-only (Section 3); scheduled send (`sendAt` field, PRODUCT.md problem #84's solution) is a planned additive field, not a new endpoint.

**`POST /v1/messages/{id}/snoozes`** - Why: PRODUCT.md solution #37 (snooze on any message, any channel) as a first-class API capability, not a client-only feature - this is what makes it usable from automation/webhooks too. Request: `{ until: timestamp }`. Response: `Snooze` resource. Permissions: workspace member. Errors: `422` if `until` is in the past.

**`POST /v1/conversations/{id}/waiting-on`**, **`GET /v1/waiting-on`** - Why: PRODUCT.md's Waiting On / Commitments tracking (problems #31-40), a cross-channel concept that must be queryable independent of any single conversation. Response for the list endpoint: cursor-paginated, sortable by `staleSince`. Permissions: workspace member, own items by default; `admin` can query team-wide for the Business-tier "who owes whom" view (PRODUCT.md solution #40).

**GraphQL `query inbox`** (Section 6) - Why: the actual inbox screen's data need. Shape: `conversations(filter, cursor, limit) { id, title, lastMessage { preview, sentAt }, contact { displayName, isVip }, unreadCount, priorityScore, tags }`. Permissions enforced identically to REST (same authorization layer underneath, GraphQL is a query shape, not a separate security boundary). Future compatibility: new fields are added to the type without versioning (GraphQL's native additive-evolution model, Section 3).

### 10.4 Contact APIs (item 20)

**`GET /v1/contacts/{id}/timeline`** - Why: PRODUCT.md solution #23/#57, the specific cross-channel value proposition made queryable. Response: cursor-paginated, chronologically merged messages across every channel that Contact is reachable on. Permissions: workspace member. Errors: `404` if contact not in workspace.

**`PATCH /v1/contacts/{id}`** with `{ isVip: true }` - Why: VIP tagging (PRODUCT.md problems #41-50) is the trigger for the platform's most safety-critical behavior (breaking through silent hours) - it is a normal resource update, deliberately not a special "VIP endpoint," because VIP is a property of a Contact, not a separate concept, and modeling it as a separate endpoint would invite the two to drift out of sync.

### 10.5 Connector / Linked Account APIs (items 21-22)

Serves: the Connector SDK's external contract (ROADMAP.md Phase 4).

**`GET /v1/providers`** - Why: clients need to know what's connectable, dynamically, without hardcoding a provider list (DATABASE.md Section 6.4's lookup-table design surfaced through the API) - this is what lets a new provider go live via a data change, all the way through to the UI, with zero client redeploy required for the "is this provider available" check. Response: array of `Provider` (`key`, `displayName`, `category`, `isEnabled`).

**`POST /v1/linked-accounts/{provider}/connect`** - Why: starts the OAuth/connect flow for a given provider. Response: `{ authorizationUrl }` for redirect-based providers, or a provider-specific connect payload (e.g. a bot-token entry form) for non-OAuth providers - the response shape varies by provider's actual auth model (Telegram Bot API differs fundamentally from Slack OAuth2), and the contract acknowledges this explicitly via a `connectMethod` discriminator field (`oauth_redirect`, `token_entry`, `qr_code`) rather than pretending every provider fits one shape.

**`GET /v1/linked-accounts/{id}/health`** - Why: ARCHITECTURE.md's connector health-check design (`status`, `lastSyncedAt`, `lastError` from DATABASE.md Section 6.5) needs to be independently pollable, not just bundled into the account's general representation, so the UI can cheaply poll connection health without re-fetching the whole account object. Permissions: workspace member.

**`DELETE /v1/linked-accounts/{id}`** - Why: disconnect. Soft-deletes the LinkedAccount (DATABASE.md Section 7) and revokes the underlying credential via the provider's own revocation endpoint where supported, and always deletes the `credentials_ref` secret from the secrets manager regardless of provider revocation support - **why unconditionally delete the secret even if provider-side revocation isn't supported**: the secret being unusable/unreachable from our side is the actual security guarantee we can make; provider-side revocation is best-effort on top of that, never the primary guarantee.

### 10.6 Automation / Rule APIs (items 28-29)

Serves: PRODUCT.md's Automation Engine, the product's core differentiator.

**`POST /v1/rules`**, **`PATCH /v1/rules/{id}`** (with `If-Match`, Section 8) - standard CRUD, `jsonb` trigger/condition/action payload validated server-side against the versioned JSON Schema referenced in `AUTOMATION_ENGINE.md` (not yet written - tracked in ROADMAP.md Phase 0). Errors: `422 INVALID_RULE_SCHEMA` with field-level `errors` array pinpointing the invalid condition/action node.

**`POST /v1/rules/{id}/test-runs`** - Why: this is the API-level expression of the UI Principle "automations must be inspectable, not magical" and directly serves PRODUCT.md's `/rules/:id/test` dry-run endpoint from ARCHITECTURE.md's original draft, now formalized. Request: `{ sampleMessageId }` or `{ syntheticMessage: {...} }` (test against a hypothetical message without needing a real one). Response: `{ wouldMatch: boolean, matchedConditions: [...], wouldExecuteActions: [...] }` - **critically, a test-run never actually executes actions**, it only reports what would happen; this is enforced server-side, not just a client-side convention, because a "test" that can accidentally send a real message would violate the entire trust premise. Permissions: workspace member with `rules:read`.

**`GET /v1/rules/{id}/executions`** - Why: surfaces `rule_execution_logs` (DATABASE.md Section 6.12) for the "this happened because Rule X matched" traceability UI Principle. Cursor-paginated, filterable by date range and status. Permissions: workspace member.

**`GET /v1/rule-templates`**, **`POST /v1/rules/from-template/{templateId}`** - Why: PRODUCT.md's Viral Features (shareable rule templates) and the Phase 18 marketplace, built on the same primitive from day one so the marketplace is additive rather than a new subsystem. Response for the first: paginated public/workspace-scoped templates. Permissions: reading public templates requires no special scope; importing requires `rules:write`.

### 10.7 Notification APIs (item 27)

**`GET /v1/notifications`** - cursor-paginated, `?unreadOnly=true` filter backing the "Needs You" count (DATABASE.md's partial-index-optimized query, Section 6.14) - **why this endpoint's correctness is called out explicitly here too**: per PRODUCT.md's UI Principles, this is the single most trust-critical read in the whole API; its contract guarantees no client-side reconciliation logic is needed to get an accurate count (the server-computed `unreadCount` in the response is always authoritative).

**`POST /v1/notifications/{id}/read`**, **`POST /v1/notifications/mark-all-read`** - standard, but `mark-all-read` accepts an optional `before: timestamp` to avoid a race where marking-all-read also silently marks a message that arrived mid-request as read.

**`PATCH /v1/notification-preferences`** - silent hours, VIP override, keyword alerts (DATABASE.md Section 6.14). Permissions: self only (a notification preference is never settable on someone else's behalf, even by a workspace admin - this is a deliberate authorization exception to the usual admin-can-manage-workspace pattern, because notification preferences are personal, not workspace policy).

### 10.8 AI APIs (items 31-32)

Serves: PRODUCT.md's AI Features section - explicitly optional, explicitly non-load-bearing, and that principle is enforced at the contract level here, not just the product level.

**`POST /v1/ai/summaries`** - Request: `{ messageId }` or `{ conversationId }`. Response: `202 Accepted` with a `{ jobId }` (this is a long-running operation, Section 12) or, for fast-path small inputs, a synchronous `200` with the summary directly - the response is discriminated by a `status` field either way so clients handle both uniformly. Permissions: requires the workspace to have AI enabled and available credit balance. Errors: `402 INSUFFICIENT_AI_CREDITS` (deliberately `402 Payment Required`, the semantically correct code, rather than overloading `403`) with `detail` pointing to the credit top-up flow; `503 AI_PROVIDER_UNAVAILABLE` if the underlying model provider is down - **and this specific error is why every AI endpoint's failure must never cascade into a broken core experience**: a client encountering `503` here must degrade to hiding the AI feature, not showing a broken state, per PRODUCT.md's "AI never load-bearing" principle made concrete.

**`GET /v1/ai/credits/balance`**, **`GET /v1/ai/credits/ledger`** - Why: surfaces DATABASE.md's `ai_credit_ledger` (Section 6.15) - the ledger endpoint is deliberately exposed to users, not just internal, so "why do I have 340 credits" (the same auditability DATABASE.md designed the ledger for) is answerable by the user themselves, not only support staff.

**`POST /v1/ai/rule-suggestions`** - Request: `{ naturalLanguagePrompt }`. Response: a **draft** `Rule` object, `isDraft: true`, never persisted until the user explicitly `POST`s it via the normal rule-creation endpoint - this is the API-level enforcement of PRODUCT.md's "AI proposes, never auto-activates" rule for automation.

Future compatibility note for this whole group: AI capability endpoints are the explicitly designated escape hatch for sub-resource versioning (Section 3, `/v1/ai/v2/...`) since model capabilities and expected request/response shapes here will evolve faster than the rest of the platform.

### 10.9 Billing APIs (items 35-36)

**`GET /v1/organizations/{id}/subscription`** - current plan, status, period, seats (DATABASE.md `subscriptions`). Permissions: `owner`/`admin`.

**`POST /v1/organizations/{id}/subscription/checkout-sessions`** - Why: initiates a hosted checkout flow (Stripe or equivalent) rather than accepting raw payment details through our own API at all - **this is a hard boundary, not a convenience**: this API will never have an endpoint that accepts a card number or equivalent payment instrument directly, ever, matching DATABASE.md Section 6.16's explicit PCI-scope-avoidance decision. Response: `{ checkoutUrl }` for redirect. Errors: `409` if a checkout session is already in progress.

**`POST /v1/webhooks/billing/stripe`** (inbound, from the payment provider, not to be confused with Section 13's outbound webhooks) - the one place this API receives, rather than sends, a webhook. Verified via provider signature header, updates `subscriptions`/`invoices` accordingly, and itself triggers our own outbound webhook events (`subscription.updated`) for any workspace-level integration that cares (Section 13).

### 10.10 Admin APIs (item: Admin APIs)

Distinct base path (`/v1/admin/...`), distinct authentication tier (platform-staff only, never reachable by a normal workspace-scoped token even an `owner`'s), separately rate-limited and separately audited.

**`GET /v1/admin/organizations`**, **`POST /v1/admin/feature-flags/{key}/overrides`**, **`POST /v1/admin/providers/{id}/disable`** (the kill-switch from DATABASE.md Section 6.4, used platform-wide during a provider outage or ToS dispute) - Why this group exists as clearly separated infrastructure rather than "just an admin role within the normal API": platform-staff operations (disabling a provider for every tenant, inspecting any organization's billing) are categorically different in blast radius from anything a workspace `owner` can do, and conflating them into the same permission model invites exactly the kind of privilege-escalation bug that a genuinely separate path structurally prevents.

---

## 11. WebSockets & Server-Sent Events

**WebSocket** (`wss://api.smartmessagecenter.com/v1/realtime`) is the primary realtime transport, used for: `message.received`, `message.status_changed`, `notification.created`, `rule.executed` (for a live "rule just fired" UI moment), and as the transport underneath GraphQL subscriptions (Section 6). Connection authenticates via the same JWT as REST, passed at connect time; the server subscribes the connection to exactly the workspace(s) the token has access to - a client cannot subscribe to a workspace it isn't authorized for, checked at subscribe time, not just at connect time (a token's authorization could theoretically span multiple workspaces for a user who belongs to several).

**SSE is used specifically for one thing, deliberately, not as a general alternative to WebSocket**: long-running operation progress (Section 12) where the client only needs a one-directional stream of status updates and doesn't need bidirectional communication - e.g. `GET /v1/imports/{id}/progress` (a future bulk-import job, or an AI batch-summarization job) streams `text/event-stream` progress events. **Why SSE here instead of just using the WebSocket channel for this too**: SSE is dramatically simpler (plain HTTP, works through more proxies/infra without special handling, auto-reconnects natively in browsers) for genuinely one-directional, single-resource progress streaming, and reserving WebSocket for the many-channel, bidirectional realtime-inbox use case keeps each transport doing the job it's actually good at instead of one transport awkwardly serving both shapes.

---

## 12. Long-Running Operations

Any operation that cannot complete within a normal HTTP request/response cycle (AI batch summarization, bulk data export for GDPR portability, large mailbox backfill sync) follows one consistent pattern across the whole API, not a bespoke shape per feature:

`POST /v1/{resource}` → `202 Accepted`, body `{ id, status: "pending", createdAt }`, `Location` header pointing to `GET /v1/{resource}/{id}`.
`GET /v1/{resource}/{id}` → `{ id, status: "pending"|"processing"|"completed"|"failed", progress: 0-100 (nullable), result: {...} (present only when completed), error: {...RFC7807...} (present only when failed) }`.
Optionally, `GET /v1/{resource}/{id}/progress` as an SSE stream (Section 11) for clients that want push instead of polling.

**Why this exact envelope for every long-running operation rather than per-feature-designed responses**: a client library (ours or a third party's) can implement "poll or stream a long-running op" exactly once, generically, and every future long-running feature (there will be more - large-scale re-indexing, bulk rule import, future large-scale AI operations) is automatically consistent with it, rather than every new long-running feature reinventing its own polling shape and every client having to special-case each one.

---

## 13. File Uploads & Media Downloads (item 19)

**Uploads**: two-step, never a raw multipart body sent to a core API endpoint directly. (1) `POST /v1/attachments/upload-urls` with `{ filename, contentType, sizeBytes }` returns a pre-signed S3 (or equivalent) upload URL plus an `attachmentId`. (2) client uploads the file bytes directly to that pre-signed URL. (3) client attaches `attachmentId` to a message-send request (Section 10.3). **Why two-step, not direct upload through our API servers**: routing large binary payloads through the NestJS API tier wastes compute/bandwidth on pure pass-through work and creates a scaling bottleneck exactly where it's least justified (ARCHITECTURE.md already designates S3 as the attachment store; the upload path should reach it directly). Virus-scanning (DATABASE.md `attachments.virus_scan_status`) runs asynchronously post-upload via an S3 event trigger, and the attachment is not attachable to an outbound message until scan status is `clean` - enforced server-side at send time, not just a UI check.

**Downloads**: `GET /v1/attachments/{id}/download-url` returns a short-lived (5-minute) pre-signed download URL, never a direct proxy through the API - same bandwidth/scaling reasoning as uploads, plus the short expiry means a leaked/logged download URL has a narrow window of exposure. Permissions checked at URL-issuance time (does this caller have access to this attachment's message/conversation), not at download time (the pre-signed URL itself carries no additional auth check, by S3's nature) - this is why the short expiry matters as much as it does.

---

## 14. Event APIs, Webhook Payloads, Internal Event Naming (items: Event APIs, Connector APIs, webhook payloads, internal event naming)

### 14.1 Internal Event Naming Convention

Every domain event (used internally on the BullMQ/Redis bus per ARCHITECTURE.md's event flow, AND externally as webhook event types) follows `{resource}.{past_tense_verb}`: `message.received`, `message.sent`, `message.status_changed`, `conversation.created`, `rule.executed`, `rule.created`, `rule.updated`, `linked_account.connected`, `linked_account.reauth_required`, `subscription.updated`, `notification.created`. **Why the same naming convention serves both internal queue events and external webhook types**: keeping one vocabulary means the mapping from "something happened internally" to "what a webhook subscriber can subscribe to" is direct and near-1:1, which keeps the webhook system honest about what it exposes (no internal event silently un-exposable, no webhook event that doesn't correspond to something real happening) rather than two divergent naming schemes that drift apart over time.

### 14.2 Outbound Webhooks (item 42)

**`POST /v1/webhooks`** - Request: `{ targetUrl, subscribedEvents: string[], secret? }` (server-generates a secret if omitted). Response: `Webhook` resource including the secret **exactly once**, at creation time only - subsequent `GET`s never return the secret again (standard "shown once" credential pattern, same principle as API keys, DATABASE.md Section 6.19).

**Delivery payload shape** (POSTed to `targetUrl`):
```
{
  "id": "delivery-uuid",
  "event": "message.received",
  "occurredAt": "2026-07-17T10:00:00Z",
  "workspaceId": "...",
  "data": { ...event-specific payload, same shape as the resource's REST representation... }
}
```
Signed via `X-SMC-Signature: sha256={hmac}` (HMAC of the raw body using the webhook's secret) - the receiver verifies this before trusting the payload, documented explicitly with example verification code in developer docs (not in this contract document itself).

**Delivery guarantees**: at-least-once, never exactly-once (standard, honest webhook semantics) - retried with exponential backoff (per Section 8's retry philosophy) up to a bounded number of attempts (e.g. 8, over roughly 24 hours) before being marked `failed` and surfaced in the workspace's webhook delivery log (DATABASE.md `webhook_deliveries`, itself queryable via `GET /v1/webhooks/{id}/deliveries`). Receivers are contractually expected to be idempotent on `data.id` (the underlying resource's own id), exactly mirroring the idempotency discipline this API asks of its own clients elsewhere (Section 8) - we hold webhook payloads to the same standard we hold our own API to.

### 14.3 Connector APIs (item: Connector APIs)

This is the external-facing surface of the Connector SDK (ARCHITECTURE.md/ROADMAP.md Phase 4), relevant once Phase 18's connector marketplace opens third-party connector development. A third-party connector integrates via:

- **Inbound**: the connector's own infrastructure calls `POST /v1/connector-ingest/{linkedAccountId}/events` with a canonical event payload (matching the internal `Message`/`Conversation` shape, Section 14.1's naming) - authenticated via a connector-scoped credential distinct from a normal user's API key, since a connector acts as a specific LinkedAccount, not as a workspace member.
- **Outbound**: the platform calls the connector's registered webhook URL (same delivery/signing/retry contract as Section 14.2) with `send.requested` events when a user sends a message through that connector.

This endpoint group is specified here at a contract level now, deliberately, even though it has zero external users until Phase 18, because our own first-party connectors (Telegram, Discord, Slack, Email - Phase 5-8) should be built against this exact same contract internally - **this is the connector-SDK equivalent of Section 1's "external-consumer discipline starts at MVP" principle**: if our own connectors don't use the real external contract, the contract will turn out to be wrong (untested against a real implementation) by the time a third party tries to use it in Phase 18, and fixing it then is a breaking change against real external developers instead of an internal refactor.

---

## 15. API Lifecycle Rules

1. A new endpoint or field ships behind a feature flag (DATABASE.md Section 6.17) if it's not yet stable, and is documented as `"stability": "beta"` in its OpenAPI-equivalent metadata (not written in this document, but the convention is fixed here) until graduated - beta endpoints are explicitly exempt from the 12-month deprecation-notice requirement (Section 3), since they were never promised stable.
2. Once an endpoint is documented as stable (not beta), it is bound by every rule in Section 3 - no exceptions, no "just this once" breaking change, ever, including for our own first-party clients (a temptation that's specifically dangerous because "we control the client too" makes it feel low-risk right up until a third party or an old app version is affected).
3. Every breaking change, even a major-version one, ships with a migration guide and, where feasible, a transition window where both the old and new shape are simultaneously available (e.g. via the sub-resource versioning escape hatch, Section 3) - "just release v2 and expect everyone to move" is not an acceptable migration strategy for an API this product's own automation/webhook features depend on as heavily as any third party would.
4. Every new capability group added to this document (a new API group, a new webhook event type) gets an ADR (per the newly-adopted `docs/adr/` practice, ROADMAP.md) if it represents a genuine architectural decision (e.g. "why did we add GraphQL for X" already is one, Section 6) - routine new endpoints within an existing, already-decided pattern do not need their own ADR, only the pattern-level decisions do.

---

## Coverage Map

| Requirement | Section |
|---|---|
| REST first | 1, 6 |
| GraphQL only where it adds value | 6 |
| Versioning strategy | 3 |
| Resource naming conventions | 2 |
| Error model (RFC 7807) | 5 |
| Pagination strategy / cursor pagination | 4 |
| Filtering | 4 |
| Sorting | 4 |
| Search | 4 |
| Rate limiting | 9 |
| Authentication | 7.1 |
| Authorization | 7.2 |
| OAuth2 | 7.1 |
| JWT | 7.1 |
| Webhooks | 14.2 |
| WebSockets | 11 |
| SSE where appropriate | 11 |
| Idempotency | 8 |
| Optimistic concurrency | 8 |
| Retry strategy | 8 |
| Long running operations | 12 |
| File uploads | 13 |
| Media downloads | 13 |
| Event APIs | 14.1, 14.3 |
| Connector APIs | 14.3 |
| Automation APIs | 10.6 |
| AI APIs | 10.8 |
| Notification APIs | 10.7 |
| Billing APIs | 10.9 |
| Organization APIs | 10.1 |
| Workspace APIs | 10.1 |
| User APIs | 10.2 |
| Admin APIs | 10.10 |
| Event contracts | 14.1 |
| Webhook payloads | 14.2 |
| Internal event naming | 14.1 |
| API lifecycle rules | 15 |
| Why / Request / Response / Permissions / Errors / Future-compat per endpoint | 10 (every entry) |
