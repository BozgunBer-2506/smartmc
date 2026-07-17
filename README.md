# Smart Message Center

An intelligent communication operating system - a unified inbox with automation and notification intelligence across Telegram, Discord, Slack, and Email.

This repository is currently in **Phase 0 - Product Foundation** (see [docs/ROADMAP.md](docs/ROADMAP.md)). No application code exists yet, deliberately - the product and technical design are being locked down first.

## Start Here

- [docs/STATUS.md](docs/STATUS.md) - current state of the project, what's done, what's next. Read this first, always.
- [docs/ROADMAP.md](docs/ROADMAP.md) - the full phase plan (0-18) and the working rules that govern how this project is built.
- [docs/PRODUCT.md](docs/PRODUCT.md) - vision, personas, problems/solutions, competitors, pricing, brand.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - system architecture, folder structure, infra, deployment, CI/CD.
- [docs/DATABASE.md](docs/DATABASE.md) - full PostgreSQL schema design.
- [docs/API.md](docs/API.md) - the API contract.
- [docs/DECISIONS.md](docs/DECISIONS.md) - index of all Architecture Decision Records ([docs/adr/](docs/adr/)).

## Repository Layout

Finalized via [ADR-0011](docs/adr/0011-monorepo-layout.md) - a pnpm workspace + Turborepo monorepo:

```
docs/            product and technical design documents, ADRs
apps/
  web/            (Phase 1) Next.js unified inbox UI
  api/            (Phase 1) NestJS backend
  desktop/          (Phase 15) Tauri wrapper
  mobile/           (Phase 14) React Native
packages/
  connector-sdk/       (Phase 4) Connector interface + registry
  automation-engine/    (Phase 10) Trigger/condition/action evaluation
  database/          Prisma schema, client, migrations
  auth/             Auth.js integration, JWT/session logic
  shared/            Canonical domain types
  ui/              shadcn/ui-based component library
  ai/              (Phase 13) AI feature integrations
  config/            eslint, tsconfig, tailwind presets
infrastructure/         Docker, Docker Compose, Kubernetes, Terraform
scripts/             CI-support and one-off scripts
```

## Working Rules

Documented in full in [docs/ROADMAP.md](docs/ROADMAP.md). The short version: document before coding, every phase ends with a commit, nothing ships that isn't traceable to [docs/PRODUCT.md](docs/PRODUCT.md), and every hard-to-reverse technical decision gets an ADR.

## License

This repository is public for transparency and portfolio purposes only. It is **not** open source - see [LICENSE](LICENSE). No permission is granted to use, copy, or distribute its contents. This is a deliberate choice at this stage, not an oversight: the most valuable output of this project so far is the architecture and product thinking in `docs/`, not yet any code, and an open-source license (MIT/Apache-2.0) is a decision to make later, deliberately, per package if it ever happens - not a default to fall into.
