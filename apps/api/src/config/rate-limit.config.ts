/**
 * Rate limit configuration, matching this codebase's existing
 * env-with-documented-defaults pattern (auth.config.ts, telegram.config.ts).
 *
 * API.md Section 9 specifies plan-tiered limits sourced from
 * `billing_plans` (DATABASE.md Section 6.16) - that table (and the whole
 * billing/subscription system) has never been built (no phase has needed
 * it yet). Rather than build billing now just to unblock rate limiting,
 * this keys off the `Organization.planTier` string that already exists
 * (default "free") with a static config map here - a disclosed
 * simplification, not silent scope-narrowing: swapping this map for a
 * real `billing_plans` read is a one-file change (rateLimitConfig.tierFor)
 * whenever billing actually gets built.
 */
export interface RateLimitTier {
  /** General API requests per window. */
  requestsPerMinute: number;
  /** Separate, tighter budget for expensive endpoints (API.md Section 9) - AI calls, bulk export. */
  aiRequestsPerMinute: number;
}

// aiRequestsPerMinute started at 10 - live-tested against
// scripts/verify-phase13.mjs's own realistic single-session AI feature
// tour (settings, summarize, suggested-replies, detect-commitments,
// rewrite, rule-suggestions x2, disable/re-enable): that's already 13
// calls before any deliberate stress-testing, so 10/min throttled normal
// single-session usage, not abuse. Raised to 30 - comfortably covers a
// real exploration burst while staying half of the general limit.
const FREE_TIER: RateLimitTier = { requestsPerMinute: 60, aiRequestsPerMinute: 30 };

const TIERS: Record<string, RateLimitTier> = {
  free: FREE_TIER,
  pro: { requestsPerMinute: 300, aiRequestsPerMinute: 90 },
  business: { requestsPerMinute: 1000, aiRequestsPerMinute: 250 },
  enterprise: { requestsPerMinute: 3000, aiRequestsPerMinute: 600 },
};

/** Applied to requests with no valid bearer token at all (login/register spam, unauthenticated probing) - deliberately the tightest budget, keyed by IP instead of workspace. */
const ANONYMOUS_TIER: RateLimitTier = { requestsPerMinute: 20, aiRequestsPerMinute: 0 };

export const rateLimitConfig = {
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  tierFor(planTier: string | undefined): RateLimitTier {
    if (!planTier) return ANONYMOUS_TIER;
    return TIERS[planTier] ?? FREE_TIER;
  },
  anonymousTier: ANONYMOUS_TIER,
  /** How long a workspace's resolved plan tier is cached in Redis before re-reading Postgres (API.md's limits don't need per-request freshness). */
  planTierCacheTtlSeconds: Number(process.env.RATE_LIMIT_PLAN_CACHE_TTL_SECONDS ?? 300),
};
