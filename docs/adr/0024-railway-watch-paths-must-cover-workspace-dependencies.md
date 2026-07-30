# ADR-0024: Railway Watch Paths Must Cover Every Workspace Dependency, Not Just an App's Own Directory

```yaml
Status: Accepted
Date: 2026-07-30
Deciders: Architecture, Founder/CTO
Related: ADR-0011 (monorepo layout), ADR-0022 (self-sufficient app build scripts)
```

## Context

During production Slack live verification, a real bug fix (`packages/connector-sdk/src/slack/slack-connector.ts` - filtering `conversations.list` results to `is_member` channels, fixing a `not_in_channel` 500) was committed and pushed to `main`, confirmed present in the repository, but **never actually ran in production** - three separate attempts to get it live (a plain git push, `railway redeploy`, and `railway up` from a local checkout) all silently deployed stale code.

The actual cause, found in `railway logs --build`: `"no changes detected in watch paths, build will skip"`. The `@smc/api` Railway service's **Watch Paths** setting (Settings → Build) was configured as just `/apps/api/**`. Since `packages/connector-sdk` sits outside that path, Railway's change-detection treated the fix as irrelevant and skipped rebuilding entirely - even `railway up`'s full local-directory upload respected the same watch-path skip logic, not just git-triggered deploys.

This is a different failure mode than ADR-0022's: that ADR fixed the **build command** not resolving workspace dependencies (`packages/*/dist` missing). This one is one layer earlier - the build never even *starts*, so ADR-0022's fix never gets a chance to run.

## Decision

Every Railway service's Watch Paths must include every workspace package its app actually depends on, not just its own `apps/<name>/**` directory. For `@smc/api`, this means adding `/packages/**` (broader than strictly necessary - `@smc/api` depends on `connector-sdk`, `database`, `event-model`, `automation-engine`, `ai`, `identity`, `shared`, `config` - but simpler and safer than enumerating each one and re-editing this list every time a new shared package is added or a dependency changes).

The same check applies to `@smc/web` and `@smc/marketing-site` if their Watch Paths are ever similarly scoped - not verified as part of this incident since the Slack fix only touched `packages/connector-sdk` and `apps/api`, but worth confirming before it causes the same silent-stale-deploy failure for a frontend package dependency.

## Consequences

- A code fix living entirely in a `packages/*` dependency will now actually deploy when `@smc/api` changes are pushed.
- This was found the hard way: three "fixed" deploys in a row that weren't actually fixed, each requiring a fresh manual database cleanup of a partially-created `LinkedAccount` row left by the still-broken code before the watch-path gap was diagnosed. Future Railway service setup for this monorepo should set `/packages/**` (or broader) in Watch Paths from the start, not discover the gap during an incident.
- No code changed for this ADR - it's a Railway dashboard configuration fix, verified live: the next build after the change actually ran `pnpm --filter @smc/api build` / `tsc -p tsconfig.json` instead of skipping.
