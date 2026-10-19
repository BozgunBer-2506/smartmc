# Looktra Personal / Business Architecture Split

- Status: Draft (not decided, not scheduled)
- Date: 2026-10-19
- Related: [ADR-0008](../adr/0008-two-level-multi-tenancy.md), [PRODUCT.md](../PRODUCT.md) "Premium Features"/"Pricing", [ROADMAP.md](../ROADMAP.md) Phase 16, [ARCHITECTURE.md](../ARCHITECTURE.md) Sections 3, 6, 13

This is a planning document, not an implementation plan that has been approved
to execute. It does not change application code, the Prisma schema, or any
live configuration. Every claim below is cited against the current repository
state so it can be checked, not taken on faith.

## 0. Framing: this is not a new idea, it's unfinished work

`PRODUCT.md`'s own "Premium Features"/"Pricing" sections (lines 534-589)
already define the exact split this document is asked to architect:

- **Looktra Personal** = `PRODUCT.md`'s **Free** and **Pro / Pro+AI Unlimited**
  tiers - single user, unified inbox, identity matching, automation rules,
  no team concepts.
- **Looktra Business** = `PRODUCT.md`'s **Business** tier (and, later,
  **Enterprise**) - shared team inbox, RBAC, escalation, audit log, per-seat
  billing.

And `ROADMAP.md`'s **Phase 16 - Teams** (line 425) already lists exactly the
B2B-only gaps as unchecked boxes: `Organizations/workspaces (multi-user)`,
`Shared inbox (claim/assign, no double-reply)`, `Roles`,
`Permissions (RBAC)`, `Audit logs`. This document exists to turn that
four-line checklist into a concrete, phased, backend-reuse-first plan - it
does not introduce a new product direction.

## 1. What already exists and is already shared-ready

This is the important finding: the schema and backend were **designed for
this split from the start** (ADR-0008, 2026-07-17), well before any Business
feature was built. Most of "make this multi-tenant" is already done.

| Component | Current state | Evidence |
|---|---|---|
| Tenancy model | Two-level `Organization` → `Workspace`, schema already supports N workspaces per Organization; every data table scopes on `workspace_id`, not `organization_id` | [0008-two-level-multi-tenancy.md](../adr/0008-two-level-multi-tenancy.md) |
| Membership | `WorkspaceMember.role` already typed `"owner" \| "admin" \| "member"` | `packages/database/prisma/schema.prisma:143` |
| Authorization skeleton | `RolesGuard` + `@Roles()` decorator fully implemented and wired into `AuthModule` | `apps/api/src/auth/roles.guard.ts`, `apps/api/src/auth/roles.decorator.ts`, `apps/api/src/auth/auth.module.ts:14,37,46` |
| Billing tier concept | `Organization.planTier` (`@default("free")`) already exists and already drives `RateLimitGuard`'s tiered limits | `packages/database/prisma/schema.prisma:49`; `ROADMAP.md` Phase 20.1 |
| Connector SDK | Every connector (`LinkedAccount`, `Conversation`, `Message`) is `workspaceId`-scoped already, not user-scoped - a Business workspace with N members needs no connector-layer change at all | `packages/database/prisma/schema.prisma:270-307,449-515`; `docs/CONNECTOR_SDK.md` |
| IdentityGraph | `Contact`/`ContactIdentity`/`IdentityMergeSuggestion` are already `workspaceId`-scoped, already support N contacts shared within one workspace | `packages/database/prisma/schema.prisma:336-411` |
| Automation engine | `Rule`/`RuleExecutionLog` are already `workspaceId`-scoped, not per-user - a rule created by one member already fires for the whole workspace today | `packages/database/prisma/schema.prisma` (Rule model); `apps/api/src/automation/rule-execution.service.ts` |
| API authorization pattern | Every handler already scopes to `claims.workspaceId` from the verified JWT, never a client-supplied id - this is exactly the pattern a shared team workspace needs, already proven in production | `apps/api/src/conversations/conversations.controller.ts:172,255,273,294,308,332,412,418,435` |
| Last-owner / shared-ownership deletion safety | Already correctly handles multi-member workspaces: a sole owner with other members is **rejected** from deleting their account (`WORKSPACE_HAS_OTHER_MEMBERS`), enforced inside a row-locked transaction (`FOR UPDATE`) specifically closing a real TOCTOU found in Phase 2B's own review; a non-owner leaving only removes their membership row, never the workspace | `apps/api/src/users/account-deletion.service.ts:14-19,54-81`; `apps/api/src/workspaces/workspace-deletion.service.ts:91-93,128-159` |

Conclusion: **the data model and the authorization pattern do not need a
redesign for Business.** The gap is entirely in membership management,
role enforcement, and frontend surface - not in the tenancy model. The
"protect existing users" invariant this document was asked to check is
**already a decided, enforced product rule**, not something Phase 16 has to
invent - it only has to extend the same rule to the new endpoints below,
never relax it.

**Workspace isolation caveat, found during this review:** tenant isolation
today is enforced entirely at the application layer (`workspaceId:
claims.workspaceId` on every query) - there is no Postgres Row Level
Security. `ADR-0008`'s own "Consequences" section (line 19) states RLS
policies "key on `workspace_id`" as part of the model's design intent, but
no migration or policy anywhere in `packages/database/prisma/migrations/`
actually creates one (checked: no `ROW LEVEL SECURITY`/`CREATE POLICY` in
the migration history). This is a **pre-existing gap, not introduced here**
- flagged because Business raises its stakes materially: more members per
workspace means more code paths that read `claims.workspaceId`, and a
shared team inbox is a higher-value target than a solo user's own data.
This document does not propose adding RLS now (that would be new
infrastructure beyond what was asked) - it recommends a security review of
application-layer isolation be scheduled before or alongside Phase 16.2
(shared inbox), as a decision for whoever owns that call, not a line item
this plan schedules itself.

## 2. Real gaps (the actual work)

| Gap | Detail | Evidence |
|---|---|---|
| No invite-a-teammate flow | `AuthService.register()` unconditionally creates exactly one `User` + one `Organization` + one `Workspace` + one `owner` `WorkspaceMember`, in one transaction - there is no code path that adds a second member to an existing workspace | `apps/api/src/auth/auth.service.ts:68-153` |
| `RolesGuard` is unused | Its own doc comment says so directly: *"No endpoint uses `@Roles()` yet... only the auth surface itself"* | `apps/api/src/auth/roles.guard.ts:11-14` |
| No platform-admin / workspace-admin management surface | `BetaInvite`'s own schema comment states the product deliberately has no admin-role concept yet beyond workspace owner/admin/member | `packages/database/prisma/schema.prisma:199-208` |
| Frontend has zero multi-workspace or team surface | `apps/web` is a single flat app: `Inbox.tsx`, `ConnectorManagement.tsx`, `Rules.tsx`, `AuthForm.tsx` - no workspace switcher, no members page, no invite UI, no org settings screen anywhere in the tree | `apps/web/components/`, `apps/web/app/` (directory listing, 2026-10-19) |
| No shared-inbox claim/assign semantics | `Conversation` has no `assignedToUserId`/claim state at all - today "the workspace" and "the one owner" are the same thing, so there is nothing to claim | `packages/database/prisma/schema.prisma` (Conversation model, no assignment field) |
| No audit-log read surface | `AuditLogService`/audit log writes already exist (seen in `auth.service.ts`'s `user.registered`/`user.login_succeeded` calls), but there is no `GET` endpoint or UI to read them back - fine for a solo user, a hard requirement for Business | `apps/api/src/auth/auth.service.ts:165-174,237-246` |
| No ownership-transfer endpoint, and no "leave workspace" endpoint | `account-deletion.service.ts`'s own rejection message tells the user to "transfer ownership or remove members," but no such transfer mechanism exists anywhere - today the only way past the block is manual removal of other members. A multi-member Business workspace needs a real transfer-ownership path | repo-wide check: no `transferOwnership`/`lastOwner` match in `apps/api/src` |
| Role authority rules are undecided for the new endpoints | The schema types the role string (`"owner" \| "admin" \| "member"`) but no code anywhere decides what an `admin` may do to an `owner`, or what happens if the sole `owner` tries to leave (not delete their account, just leave) a workspace that still has other members | `packages/database/prisma/schema.prisma:143`; no corresponding rule in `apps/api/src` |

## 3. Proposed split: what diverges, what stays one thing

**Stays exactly one shared thing (no fork, no duplication):**
- Database, schema, and every existing table.
- Connector SDK and all four connector implementations.
- IdentityGraph matching/merge logic.
- Automation rule engine and its trigger/condition/action model.
- Auth (`JwtAuthGuard`), JWT issuance, session/refresh handling.
- The REST API's existing resources and URI versioning scheme (ADR-0006).

**Diverges by role/plan tier, inside the same backend (no service split):**
- `RolesGuard` starts actually gating endpoints - membership-management
  endpoints (`invite`, `remove member`, `change role`) become
  `@Roles("owner", "admin")`-gated; everything that exists today stays
  reachable by any role so Personal workspaces (always a lone `owner`) are
  unaffected.
- A small number of new, additive endpoints: invite member, accept invite,
  list members, change member role, remove member, list audit log. All
  workspace-scoped exactly like every existing endpoint - no new
  authorization *pattern*, just new resources using the existing one.
- `Conversation` claim/assignment: an additive nullable
  `assignedToUserId`/`claimedAt` pair. A Personal (single-member) workspace
  never exercises this path; a Business workspace's shared inbox does.
- Plan-tier gating (`Organization.planTier`) extends from today's rate-limit
  use (Phase 20.1) to also gate which of the above endpoints exist for that
  org - same mechanism already in production, one more consumer of it.

**Diverges at the frontend, not the backend:**
- `apps/web` (Personal) stays the compact single-workspace UI it is today -
  no workspace switcher needed, since a Personal account only ever has one.
- A new, separate surface for Business (members list, invite flow, shared
  inbox claim UI, audit log view) is additive UI, not a rewrite of
  `Inbox.tsx`/`Rules.tsx`/`ConnectorManagement.tsx` - those three screens are
  reused as-is inside the Business surface too, since "my inbox" and "the
  team's shared inbox" differ only in claim/assignment affordances layered
  on top of the same conversation list.

This keeps the explicit constraint from the request: **one backend, one
connector layer, one database** - the fork is in authorization enforcement
and in frontend surface area, never in data model or business logic.

**Role authority invariants (decided here, not left open):** the draft
reviewed against `ADR-0008`/`PRODUCT.md` left this undecided; fixed now so
Phase 16.1 isn't built against an ambiguous rule.
- Exactly one `owner` per workspace at all times - never zero, never
  ambiguous about which member it is. This is already an implicit
  invariant today (`register()` always creates exactly one); Phase 16.1
  must enforce it explicitly once a second member can exist.
- Only the current `owner` can transfer ownership (to an existing `admin`
  or `member`, promoting them); transfer and demotion of the old owner
  happen atomically, inside one transaction - never a window where a
  workspace briefly has zero or two owners.
- `admin` may invite, remove, and change the role of `member`s, but may
  **never** remove or demote the `owner` - mirrors the existing
  `OWNER_ROLE_REQUIRED` check `workspace-deletion.service.ts:91-93` already
  uses for deletion, extended to membership changes.
- The sole `owner` of a workspace with other members **cannot leave**
  without first transferring ownership - the same product rule
  `account-deletion.service.ts:74-79` already enforces for account
  deletion (`WORKSPACE_HAS_OTHER_MEMBERS`), extended to a plain "leave
  workspace" action so the invariant is consistent whether the owner is
  deleting their account or just stepping back.

**Personal → Business transition (decided here, not left open):** the
draft did not previously say what happens when an existing Personal user
wants to add teammates - this matters directly for protecting existing
users' data ownership expectations. **Decision: upgrading to Business
never converts an existing solo workspace into a shared one in place.**
Inviting a first teammate creates a **new, sibling `Workspace` under the
same `Organization`** - `ADR-0008` already supports N workspaces per
Organization with no schema change (line 14), so this costs nothing new to
build. The user's existing Personal workspace (and everything in it -
conversations, contacts, rules) stays exactly as private as it is today,
untouched and still solely theirs, unless they explicitly choose to invite
someone into *that specific* workspace rather than a new one. This avoids
the real risk an in-place conversion would create: a Personal user's
existing message history silently becoming visible to an invited teammate
by default, with no explicit action taken on that specific data.

## 4. Phased migration plan

Numbered as **Phase 16.x**, slotting into `ROADMAP.md`'s existing, currently
empty Phase 16 rather than inventing a new phase number - this *is* Phase 16,
broken into the same incremental, independently-shippable, live-verified
style every other phase in that document already uses.

**Phase 16.1 - Membership management (backend only)**
- `POST /v1/workspace/invites`, `POST /v1/workspace/invites/:id/accept`,
  `GET /v1/workspace/members`, `PATCH /v1/workspace/members/:id` (role),
  `DELETE /v1/workspace/members/:id`, `POST /v1/workspace/leave`,
  `POST /v1/workspace/transfer-ownership`.
- Wire `RolesGuard`/`@Roles()` onto these for the first time, enforcing the
  role-authority invariants above (one owner always, owner-removal
  blocked, last-owner-leave blocked without transfer first) - reusing
  `workspace-deletion.service.ts`'s existing row-locked-transaction pattern
  for the same TOCTOU protection, not a new concurrency mechanism.
- Inviting a first teammate creates a new sibling `Workspace` (see the
  Personal → Business transition decision above) - this phase's `invites`
  endpoint operates on that new workspace, never retrofits an existing one.
- No UI yet. No existing endpoint changes. Fully additive - a Personal
  workspace (always exactly one `owner` member) is structurally unaffected,
  since nothing about its existing single-member state changes.

**Phase 16.2 - Shared inbox claim/assign**
- Additive `Conversation.assignedToUserId`/`claimedAt` columns (nullable,
  migration-only, no backfill needed - every existing row stays unassigned,
  meaning "unclaimed in a workspace with one member" is indistinguishable
  from today's behavior).
- `POST /v1/conversations/:id/claim` / `/unclaim`, scoped to
  `claims.workspaceId` exactly like every existing conversation endpoint.
- `PRODUCT.md`'s own requirement: "no double-reply" - enforced the same way
  `Phase 20.4`'s optimistic concurrency already works (`If-Match`), not a
  new mechanism.

**Phase 16.3 - Audit log read surface**
- `GET /v1/workspace/audit-log`, cursor-paginated exactly like every other
  list endpoint (Phase 20.2's existing `cursor-pagination.ts` utility -
  zero new pagination code).
- Audit log *writes* already exist (`AuditLogService`); this phase is read
  access only.

**Phase 16.4 - Plan-tier gating**
- Extend `Organization.planTier`'s existing rate-limit consumer (Phase
  20.1) to also gate Phase 16.1-16.3's endpoints to `"business"`/
  `"enterprise"` tiers - a Personal/Free/Pro org gets a clear `403`, not a
  silently-missing feature.

**Phase 16.5 - Business frontend surface**
- New screens only: members list + invite, shared-inbox claim affordance on
  the existing `Inbox.tsx` conversation list (additive UI state, not a
  rewrite), audit log view.
- `apps/web`'s existing Personal screens stay untouched.

**Deliberately deferred past Phase 16** (per `PRODUCT.md`'s own scope notes,
not reopened here): escalation/SLA workflows, team analytics dashboard,
admin-managed rule-template playbooks, SSO/SCIM (Phase 17 Enterprise).

## 5. Existing users are provably unaffected by this plan

Checked explicitly, per the request to verify existing-user protection:
- Every Phase 16.x change is additive (new endpoints, new nullable
  columns, a new sibling workspace on upgrade) - no existing endpoint,
  column, or row is modified or removed by this plan.
- A Personal workspace's membership shape (exactly one `owner`, no other
  members) never changes unless its owner explicitly invites someone -
  and that invite targets a new workspace, not the existing one (Section 3).
- The deletion-safety invariant this plan depends on
  (`WORKSPACE_HAS_OTHER_MEMBERS`, last-owner protection) is not new - it
  already ships in production today and already protects every existing
  user; Phase 16.1 extends it, never weakens it.
- `RolesGuard` gates only the new membership-management endpoints; every
  endpoint that exists today remains reachable by any role exactly as it
  is now, so no current API caller sees a behavior change.

## 6. What this document explicitly does not do

- Does not modify `schema.prisma`, application code, or any Railway/CI
  configuration.
- Does not create a migration.
- Does not commit, push, or deploy anything.
- Does not add new infrastructure (e.g. Postgres RLS) - Section 1's
  isolation caveat is flagged as an open question for a separate security
  review to decide, not scheduled as work here.
- Does not decide *whether* or *when* Phase 16 should be scheduled - that is
  a product/business call outside this document's scope.
