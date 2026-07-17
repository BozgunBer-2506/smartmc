# 0011 - Monorepo Layout: apps/ + packages/ via pnpm Workspaces + Turborepo

- Status: Accepted
- Date: 2026-07-18
- Deciders: Founder/CTO
- Related: [ARCHITECTURE.md](../ARCHITECTURE.md) Section 2, [ROADMAP.md](../ROADMAP.md) Phase 1, supersedes the provisional `backend/`+`frontend/`+`connectors/` layout adopted 2026-07-17

## Context

The repository was provisionally restructured on 2026-07-17 into top-level `backend/`, `frontend/`, `connectors/` directories, deliberately flagged as unreconciled against `ARCHITECTURE.md`'s original `apps/`+`packages/` pnpm-workspace design (ADR-0009's monolith-plus-independent-connector-workers decision assumes this kind of package boundary). Per working discipline (ROADMAP.md), this could not be left unresolved into Phase 1 - the actual code bootstrap depends on knowing where code lives.

Two options were evaluated:

**Option 1: `backend/` + `frontend/`** - two top-level folders, each its own independently-managed project (own `package.json`, own dependency tree, no enforced workspace tooling).

**Option 2: `apps/` + `packages/` via pnpm workspaces + Turborepo** - a single workspace root; `apps/*` holds deployable applications (web, api, desktop, and future mobile), `packages/*` holds shared, independently-versioned libraries (`connector-sdk`, `automation-engine`, `database`, `auth`, `shared`, `ui`, `ai`, `config`); Turborepo orchestrates builds/tests/caching across both.

### Evaluation

| Dimension | `backend/` + `frontend/` | `apps/` + `packages/` (pnpm + Turborepo) |
|---|---|---|
| **Scalability** (more apps/services over time) | Poor - adding desktop or mobile means a third top-level folder with no shared tooling convention, and no enforced boundary between "deployable" and "shared library" | Strong - `apps/*` and `packages/*` are structurally distinct from day one; adding `apps/mobile` (Phase 14) or a new `packages/*` library is additive, not a redesign |
| **Developer experience** | Two isolated projects; a developer touching both web and API context-switches between separate installs, separate lint/type configs, separate scripts | One `pnpm install` at the root, one lint/type/test config inherited via `packages/config`, one command (`turbo dev`) runs everything relevant - directly serves ROADMAP.md's Phase 1 "working, empty project" goal with less setup surface |
| **Code sharing** (web/backend/desktop/future mobile) | None structurally - shared types (e.g. the canonical `Message` domain shape) would have to be duplicated or published as a separate versioned npm package with its own release process, which is friction disproportionate to this stage | Direct workspace-protocol imports (`workspace:*`) - `packages/shared` and `packages/database`'s generated Prisma types are consumed by `apps/api`, `apps/web`, and later `apps/desktop`/`apps/mobile` with zero publish step, zero version drift |
| **Connector architecture** (ADR-0004) | The Connector SDK has no natural home - it's neither `backend/` (it's meant to be provider-agnostic and eventually third-party-authored, Phase 18) nor `frontend/` | `packages/connector-sdk` is a first-class, independently buildable/testable/versionable package; per-provider connector implementations (`connectors/telegram`, etc., per ADR-0004) sit alongside it as siblings under `packages/`, matching the plugin architecture ADR-0004 already committed to |
| **Desktop support** (Tauri, Phase 15) | `frontend/` would need to be split again later to separate the Tauri wrapper from the Next.js web app, or Tauri gets awkwardly nested inside `frontend/` | `apps/desktop` (Tauri) wraps `apps/web`'s build output directly as a sibling app, the exact pattern ARCHITECTURE.md's tech-stack section already assumed |
| **Future mobile support** (React Native, Phase 14) | Same problem as desktop - no natural slot, another ad hoc top-level folder | `apps/mobile` slots in as a fourth `apps/*` entry; `packages/shared`/`packages/ui`-derived tokens (where React Native can consume them) are already positioned to be reused, not rebuilt |
| **CI/CD** | Every project's CI is hand-wired independently; no shared caching, no "only build what changed" without custom scripting | Turborepo's task graph + remote caching (ARCHITECTURE.md Section 9) gives affected-package-only builds/tests out of the box - directly reduces CI time and cost as the repo grows past Phase 1 |
| **Testing** | Cross-package integration tests (e.g. a connector-sdk contract test consumed by both a real connector and the mock connector, ROADMAP.md Phase 4) have no clean import path without a publish step | Workspace-linked packages import each other's test utilities directly; the Phase 4 "mock connector validates the SDK end-to-end" requirement (ROADMAP.md) is straightforward exactly because the SDK and its consumers share a workspace |
| **Build performance** | No caching/orchestration; every project builds fully, every time, in CI | Turborepo caches per-task, per-package outputs (local and remote); only what actually changed rebuilds - matters increasingly as `packages/*` grows past the initial 8 |
| **Future microservices** (if a core module ever needs to split out, per ADR-0009's revisit trigger) | No worse, no better - either layout can eventually be split into separate repos/services if truly needed | Slightly better: a `packages/*` library already has its own `package.json`/build boundary, so promoting it to its own deployable service is a smaller step than extracting a folder that was never independently built to begin with |

## Decision

Adopt `apps/` + `packages/` via **pnpm workspaces** for dependency/workspace management and **Turborepo** for task orchestration and caching, per the layout already specified in `ARCHITECTURE.md` Section 2 and now formally ratified:

```
apps/
  web/          Next.js unified inbox UI
  api/          NestJS backend (modular monolith, ADR-0009)
  desktop/      Tauri wrapper (Phase 15)
  mobile/       React Native (Phase 14, added when that phase starts)

packages/
  connector-sdk/     Connector interface + registry + test harness (ADR-0004)
  automation-engine/  Trigger/condition/action evaluation (Phase 10)
  database/        Prisma schema, client, migrations (DATABASE.md)
  auth/          Auth.js integration, JWT/session logic
  shared/         Canonical domain types (Message, Conversation, Contact, etc.)
  ui/           shadcn/ui-based component library
  ai/           AI feature integrations (Phase 13), isolated per PRODUCT.md's "AI never load-bearing" principle
  config/         eslint, tsconfig, tailwind presets

docs/          product and technical design documents, ADRs (unchanged)
infrastructure/    Docker, Docker Compose, Kubernetes manifests, Terraform (ARCHITECTURE.md Section 7-9)
scripts/        one-off and CI-support scripts
```

This **supersedes** the provisional `backend/`+`frontend/`+`connectors/` layout adopted 2026-07-17. That layout is retired, not carried forward as an alias or transitional structure - the repository is restructured immediately (Section below / STATUS.md), since it is still empty of application code and the cost of migrating now is effectively zero versus migrating after Phase 1 code exists.

The Turborepo-vs-Nx open question from `ARCHITECTURE.md` Section 12 is resolved here as well, in Turborepo's favor: Nx's richer generator/graph tooling is not yet justified at this repo's size, and Turborepo's simpler adoption cost fits Phase 1's "get to a working empty project fast" goal better; this can be revisited if the package count/build-graph complexity grows enough to justify Nx's extra tooling later (a revisit trigger, not a scheduled re-evaluation).

## Consequences

- `ARCHITECTURE.md`, `ROADMAP.md`, and `STATUS.md` are updated to remove the "open reconciliation item" and reflect this as the final, non-provisional structure.
- The `backend/`, `frontend/`, `connectors/` top-level directories and their `.gitkeep` placeholders are removed; `apps/*`, `packages/*`, `infrastructure/`, `scripts/` placeholders take their place.
- Phase 1 (ROADMAP.md) proceeds against this exact structure with no further ambiguity - `pnpm-workspace.yaml` and `turbo.json` are Phase 1's first concrete artifacts.
- `packages/connector-sdk` and future per-provider connector packages are the structural home the Phase 18 connector marketplace will eventually publish against, so that marketplace remains additive rather than requiring a later repo reorganization.
