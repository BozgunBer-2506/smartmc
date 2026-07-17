# 0008 - Two-Level Multi-Tenancy: Organization and Workspace

- Status: Accepted
- Date: 2026-07-17
- Deciders: Founder/CTO
- Related: [DATABASE.md](../DATABASE.md) Section 4

## Context

Most Smart Message Center users at MVP are a "tenant of one" (PRODUCT.md's Freelancer/Developer/Founder personas), but the Business tier (Support/Sales teams, ROADMAP.md Phase 16) needs real multi-user tenants with shared data, and an even later possibility (an agency managing multiple clients) needs separated data groups under one billing relationship. A single-level tenancy model (just "Organization = tenant") would block per-client/per-department data separation without a breaking migration when Phase 16 arrives.

## Decision

Model tenancy at two levels: **Organization** (the billing/identity boundary - one per customer) and **Workspace** (the data-sharing/access-control boundary within an Organization). At MVP, one Organization has exactly one Workspace (1:1), but the schema supports N Workspaces per Organization from day one. `workspace_id`, not `organization_id`, is the actual tenant-scoping column on data tables.

## Consequences

- Phase 16 (Teams) becomes additive - enabling multiple Workspaces per Organization, or multiple members per Workspace, requires no schema restructuring.
- Row Level Security policies (DATABASE.md Section 10) and every tenant-scoped query consistently key on `workspace_id`, giving one uniform pattern instead of two competing scoping concepts.
- Adds one extra level of indirection (Organization → Workspace → data) that a single-tenant-level model wouldn't have - accepted because retrofitting this split later, after real tenant data exists, is materially more expensive than designing for it now while the schema is still small.
- Billing (subscriptions, invoices) attaches to Organization, not Workspace, since billing is a customer-relationship concept, not a data-sharing one - this split is what lets a future multi-workspace Organization be billed once, coherently.
