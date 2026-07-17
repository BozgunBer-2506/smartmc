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

```
docs/          product and technical design documents, ADRs
backend/        (Phase 1) NestJS API
frontend/        (Phase 1) Next.js web app
connectors/       (Phase 4+) Connector SDK and per-provider connectors
```

## Working Rules

Documented in full in [docs/ROADMAP.md](docs/ROADMAP.md). The short version: document before coding, every phase ends with a commit, nothing ships that isn't traceable to [docs/PRODUCT.md](docs/PRODUCT.md), and every hard-to-reverse technical decision gets an ADR.
