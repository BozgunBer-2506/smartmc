# 0020 - Marketing Site as an Isolated `apps/marketing-site` App

- Status: Accepted
- Date: 2026-07-22
- Deciders: Founder/CTO
- Related: [ADR-0011](0011-monorepo-layout.md)

## Context

The user supplied a complete, pre-built marketing/landing site (Next.js 14, TypeScript, Tailwind CSS, shadcn/ui-style primitives on Radix UI, Framer Motion) as a standalone deliverable, external to this session's own work. It has no relationship to the product's data model, API, or Connector SDK - it is static marketing content describing the product (hero, problem/solution, architecture explainer, IdentityGraph diagram, roadmap, FAQ, CTA).

`ADR-0011`'s repository layout enumerated `apps/{web,api,desktop,mobile}` - a marketing site was never part of that plan, and `ROADMAP.md` has no phase for one. Per this project's working rule ("a repository-layout decision is never left open past the document that depends on it"), adding it needs its own decision record, not a silent `apps/` addition.

The site's stack (Tailwind, Radix UI, Framer Motion, `@fontsource/*`) is new to this monorepo - `apps/web` uses plain inline styles today, and `DESIGN_SYSTEM.md`'s shadcn/ui-on-Tailwind direction hasn't been built against anywhere yet. Introducing this stack for the product UI itself would be a real, debatable technology decision; introducing it for a marketing site that will never share code with the product is a much narrower, lower-risk one.

## Decision

Added as `apps/marketing-site` - a new, fully isolated Next.js app in the existing pnpm/Turborepo workspace (`pnpm-workspace.yaml`'s `apps/*` glob already covers it; no workspace config changes needed). Isolation is the load-bearing property of this decision:

- It imports nothing from `packages/*` and nothing from `apps/*` imports it - a dependency graph dead end by design, so its stack (Tailwind, Radix, Framer Motion) never becomes a transitive concern for the product's build, bundle size, or type-checking.
- It runs on port 3001 (`apps/web` already owns 3000), so both can run side by side in `pnpm dev` without collision.
- Its `package.json` matches this repo's existing per-app script convention exactly (`dev`/`build`/`lint`/`typecheck`), so it participates in `pnpm lint`/`pnpm typecheck`/`pnpm build` (via Turborepo's pipeline) with zero pipeline configuration changes - `turbo.json`'s task definitions are already generic across every workspace member.
- It uses `next lint` + `eslint-config-next` (matching `apps/web`'s pattern for a Next.js app), not `@smc/config`'s shared preset - the two Next.js apps in this monorepo both independently follow Next's own recommended lint setup, which is the established precedent, not a new one.

One dependency present in the supplied source (`playwright-core`) was removed during integration - `grep` found no reference to it anywhere in `src/`, and this project's own working rule is that every dependency needs a clear justification; an unused one doesn't have one.

## Consequences

- `apps/marketing-site` is content-owned by whoever maintains the marketing story, not the engineering roadmap - it does not get its own `ROADMAP.md` phase, and changes to it don't need a phase review the way product features do. It's tracked here and in `STATUS.md`'s repository listing, not woven into the phase-by-phase Definition of Done discipline the product apps follow.
- Its tech stack is deliberately not a precedent for the product UI (`apps/web`). If `DESIGN_SYSTEM.md`'s shadcn/ui direction is eventually built for the real product, that is its own decision, made on its own merits - not inherited from this ADR just because Tailwind already exists somewhere in the monorepo now.
- Deploying it (a real hostname, CI/CD for it specifically) is out of scope for this ADR - it's wired into the monorepo's local build/lint/typecheck pipeline only; a deployment target is a separate, later decision when the site is ready to go live.
