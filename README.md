# Smart Message Center

An intelligent communication operating system - a unified inbox with automation and notification intelligence across Telegram, Discord, Slack, and Email.

Phase 0 (Product Foundation) and Phase 1 (Project Bootstrap) are complete. Phase 2 (Authentication) is complete and verified live. Phase 3 (Identity & Messaging Foundation) is next - see [docs/STATUS.md](docs/STATUS.md) for exactly where things stand.

## Start Here

- [docs/STATUS.md](docs/STATUS.md) - current state of the project, what's done, what's next. Read this first, always.
- [docs/ROADMAP.md](docs/ROADMAP.md) - the full phase plan (0-18) and the working rules that govern how this project is built.
- [CHANGELOG.md](CHANGELOG.md) - what shipped in each tagged release.
- [docs/PRODUCT.md](docs/PRODUCT.md) - vision, personas, problems/solutions, competitors, pricing, brand.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - system architecture, folder structure, infra, deployment, CI/CD.
- [docs/DATABASE.md](docs/DATABASE.md) - full PostgreSQL schema design.
- [docs/API.md](docs/API.md) - the API contract.
- [docs/SECURITY.md](docs/SECURITY.md) - threat model, credential handling, GDPR posture.
- [docs/DECISIONS.md](docs/DECISIONS.md) - index of all Architecture Decision Records ([docs/adr/](docs/adr/)).
- [docs/reviews/](docs/reviews/) - the Phase Review filed at the end of every completed phase.

## Running It Locally

```
pnpm install
docker compose up -d   # Postgres, Redis, mailhog
pnpm --filter @smc/database db:generate
pnpm --filter @smc/database db:push
pnpm dev                # apps/web on :3000, apps/api on :4000
```

Then `GET http://localhost:4000/health`, or try `POST http://localhost:4000/v1/auth/register`. See [docs/STATUS.md](docs/STATUS.md)'s "What Actually Runs Right Now" section for the full walkthrough, including a Windows/WSL note that will save you real time if you hit it cold.

## Repository Layout

Finalized via [ADR-0011](docs/adr/0011-monorepo-layout.md) - a pnpm workspace + Turborepo monorepo:

```
docs/            product and technical design documents, ADRs, phase reviews
apps/
  web/            Next.js app (dev Inbox so far - Phase 1 vertical slice)
  api/            NestJS backend (health, events, realtime, auth, users, audit)
  desktop/          (Phase 15) Tauri wrapper
  mobile/           (Phase 14) React Native
packages/
  connector-sdk/       Mock Connector today; full contract is Phase 4
  automation-engine/    (Phase 10) Trigger/condition/action evaluation
  database/          Prisma schema, client, soft-delete extension
  identity/          IdentityGraph exact-match resolver
  event-model/         Canonical event envelope + event types
  shared/            Canonical domain types
  auth/             (reserved - actual auth implementation currently lives in apps/api/src/auth)
  ui/              Minimal component primitives; full design system is later
  ai/              (Phase 13) AI feature integrations
  config/            (reserved) eslint, tsconfig, tailwind presets
infrastructure/         Docker, Docker Compose, Kubernetes, Terraform
scripts/             @smc/scripts - regression checks (verify-realtime, verify-soft-delete, verify-auth) and dev tooling
```

## Working Rules

Documented in full in [docs/ROADMAP.md](docs/ROADMAP.md). The short version: document before coding, every phase ends with working software, a Phase Review, and a git tag; nothing ships that isn't traceable to [docs/PRODUCT.md](docs/PRODUCT.md); every hard-to-reverse technical decision gets an ADR; new documentation is added only when a decision genuinely requires it, not by default.

## License

This repository is public for transparency and portfolio purposes only. It is **not** open source - see [LICENSE](LICENSE). No permission is granted to use, copy, or distribute its contents. This is a deliberate choice at this stage, not an oversight: an open-source license (MIT/Apache-2.0) is a decision to make later, deliberately, per package if it ever happens - not a default to fall into.
