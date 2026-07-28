# 0022 - Deployable Apps Get a Self-Sufficient `prebuild` Script

- Status: Accepted
- Date: 2026-07-29
- Deciders: Founder/CTO
- Related: [ADR-0011](0011-monorepo-layout.md), `turbo.json`, `pnpm-workspace.yaml`

## Context

A Railway deployment of `apps/web` failed with `Module not found: Can't resolve '@smc/ui'`. Investigation confirmed every structural piece of the monorepo was correct: `packages/ui` exists, its `package.json` name is `@smc/ui`, `pnpm-workspace.yaml` includes `packages/*`, and `apps/web/package.json` depends on `"@smc/ui": "workspace:*"` - `pnpm install` correctly symlinks it into `apps/web/node_modules/@smc/ui`.

The actual cause: `packages/ui/package.json`'s `"main"` field points to `dist/index.js`, and `dist/` is (correctly) gitignored, generated only by that package's own `build` script. Locally, this has always worked because `pnpm build` (or `pnpm dev`) is run from the **repo root**, where Turborepo's `build` task (`turbo.json`: `"dependsOn": ["^build"]`) builds every workspace dependency before building the app that depends on it. Reproduced directly: with every `packages/*/dist` deleted, running `next build` from inside `apps/web` alone (simulating a PaaS build scoped to that subdirectory, which is exactly what Railway's build most likely does) fails with the identical error. Restoring `packages/*/dist` and re-running from the repo root succeeds - confirming the gap is specifically "building an app in isolation from its own directory, without an external orchestrator (Turborepo) having already built its workspace dependencies first."

No `railway.json`/`nixpacks.toml` exists in this repo, and Railway's actual per-service Root Directory/Build Command configuration lives only in its dashboard, outside this codebase's visibility - undocumented and unreproducible from the repo alone. Rather than guess at or depend on that external configuration being set a particular way, the fix should make each deployable app's own build correct **regardless of what directory it's invoked from**.

## Decision

**Each deployable app (`apps/web`, `apps/api`) gets a `prebuild` npm-lifecycle script** that builds exactly its own transitive workspace dependencies before its own `build` script runs:

```json
"prebuild": "pnpm --filter \"@smc/web^...\" run build"
```

`pnpm`'s `<pkg>^...` filter selects `<pkg>`'s dependencies only (excluding `<pkg>` itself, avoiding any self-referential loop through `prebuild`), in correct topological order, skipping any matched package with no `build` script (e.g. `@smc/config`, which ships plain JS with no build step). `prebuild` is a standard npm lifecycle hook - `pnpm run build` (and `npm run build`) automatically run it first, with no extra flag or CI-specific wiring required. Verified from a fully cold state (every `packages/*/dist` deleted): `cd apps/web && pnpm run build` and `cd apps/api && pnpm run build` both succeed in isolation, and the existing root-level `pnpm build` (Turborepo) still succeeds unchanged (`prebuild`'s work is redundant with Turborepo's own `^build` graph when both run, which is harmless - a fast, idempotent re-run of `tsc`, not a conflict).

## Consequences

- Each deployable app's build is now correct independent of what external orchestrator (or lack thereof) invokes it, and independent of Railway's specific dashboard configuration - the fix lives entirely in the repo, is reviewable, and needs no Railway-side documentation to be correct.
- `prebuild`'s dependency list (`pnpm`'s filter) is automatically derived from each package's actual `dependencies`/`devDependencies` graph - it does not need manual updating as the dependency graph changes, the same property Turborepo's own `^build` already has.
- This does not replace or duplicate Turborepo's role for local development and CI (`turbo run build`, `turbo run dev`) - both continue to work exactly as before, verified unchanged. `prebuild` exists specifically for the case Turborepo cannot cover: an app being built as a standalone unit from its own directory, with no repo-root orchestrator involved.
- No `railway.json` was added, since the actual Root Directory/Build/Start command configuration for each Railway service is unknown from this codebase and this fix does not depend on discovering it - it works correctly under either a repo-root-scoped or an app-subdirectory-scoped build.
