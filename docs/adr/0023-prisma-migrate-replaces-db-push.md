# ADR-0023: Prisma Migrate Replaces `db push` as the Schema Change Mechanism

```yaml
Status: Accepted
Date: 2026-07-29
Deciders: Architecture, Founder/CTO
Related: ADR-0002 (Prisma), ADR-0022 (self-sufficient app build scripts)
```

## Context

Since the project's inception, every schema change has been applied with `prisma db push` - there was never a `prisma/migrations` directory or migration history. This surfaced as a real production incident: Railway provisioned a fresh, empty Postgres database, and nothing in the deploy pipeline ever ran `db push` (or any equivalent) against it, so every table - including `linked_accounts` - was missing, causing `PrismaClientKnownRequestError P2021` on first request.

The immediate fix was a one-time manual `db push` run against production to unblock the deployment (see `docs/reviews/` incident notes). That fix works, but `db push` is not a production-safe long-term mechanism:

- No migration history - there is no record of what changed, when, or why.
- No rollback path - a bad schema change can only be undone by another push, which may already have destroyed data.
- Silent destructive changes - `db push` can drop a column or table without confirmation in non-interactive mode, matching `schema.prisma` exactly regardless of what that implies for existing data.
- No drift detection - nothing catches a developer editing `schema.prisma` without applying the change anywhere.

## Decision

Adopt `prisma migrate` as the schema change mechanism, replacing `db push` for anything beyond quick local prototyping:

1. **Baseline migration** (`packages/database/prisma/migrations/20260729000000_baseline/`): a `prisma migrate diff --from-empty --to-schema-datamodel` snapshot of the schema as it stood at the time of adoption. Marked as already-applied (`prisma migrate resolve --applied`) on both the local dev database and production - no schema was altered, only Prisma's internal `_prisma_migrations` bookkeeping table was updated.
2. **Local workflow**: schema changes are made with `pnpm db:migrate:dev` (`prisma migrate dev`), which generates a new timestamped migration file under `prisma/migrations/` for every change, replacing ad hoc `db push` calls.
3. **Deploy pipeline**: `apps/api/package.json` gets a `prestart` script (`pnpm --filter @smc/database db:migrate:deploy`, i.e. `prisma migrate deploy`) - applies any pending migration files before the server starts, following the same self-sufficient-lifecycle-hook pattern ADR-0022 established for `prebuild`. Unlike `db push`, `migrate deploy` only applies known, reviewed migration files - it does not compute or apply an ad hoc diff, so it can't cause a silent destructive change.
4. **CI drift check**: `.github/workflows/ci.yml` gained a Postgres service container and a step that runs `prisma migrate deploy` against a throwaway database, then `prisma migrate diff --from-url <that db> --to-schema-datamodel prisma/schema.prisma --exit-code` - if a developer edits `schema.prisma` without creating a matching migration, this diff is non-empty and CI fails.

`db:push` remains in `package.json` for quick local schema iteration before a change is finalized into a migration file, matching Prisma's own recommended prototyping workflow - it is no longer used against any shared or production database.

## Consequences

- Every schema change from this point forward has a reviewable, version-controlled migration file and a real rollback path (a new migration undoing the old one).
- Deploys apply schema changes automatically and safely via `prestart`, the same self-sufficient pattern already proven for builds - no manual `db push` step is needed for future changes.
- CI now requires a live Postgres service, adding a small amount of CI runtime; this is the standard cost of a real migration-drift check and was verified locally (both the pass and fail cases) before being added.
- As with ADR-0022, the `prestart` hook only runs if Railway's actual start command is `pnpm run start`/`npm start` - if Railway is configured to invoke `node dist/main.js` directly, the hook is skipped and `migrate deploy` must be run manually, the same class of risk already disclosed for the `prebuild` hook.
