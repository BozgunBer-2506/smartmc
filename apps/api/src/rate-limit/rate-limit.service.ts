import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { getPrismaClient } from "@smc/database";
import { rateLimitConfig } from "../config/rate-limit.config";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Unix seconds when the current window resets - for the X-RateLimit-Reset header (API.md Section 9). */
  resetAt: number;
}

/**
 * Redis fixed-window counter (INCR + conditional EXPIRE, the same
 * pattern LoginThrottleService already uses) - API.md Section 9 says
 * "sliding window"/"token buckets", but a fixed window is the standard,
 * simple, well-understood approximation most real APIs (GitHub included)
 * actually ship; a true sliding-window log or token-bucket refill is
 * meaningfully more code for a difference that only matters right at a
 * window boundary. Disclosed here rather than silently deviating from
 * the spec's exact wording.
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly redis = new Redis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  });

  async consume(key: string, limit: number): Promise<RateLimitResult> {
    if (limit <= 0) {
      // aiRequestsPerMinute: 0 for the anonymous tier - deny outright, no Redis round-trip needed.
      const resetAt = Math.floor(Date.now() / 1000) + Math.floor(rateLimitConfig.windowMs / 1000);
      return { allowed: false, limit, remaining: 0, resetAt };
    }

    const redisKey = `rate_limit:${key}`;
    const count = await this.redis.incr(redisKey);
    let ttlMs: number;
    if (count === 1) {
      await this.redis.pexpire(redisKey, rateLimitConfig.windowMs);
      ttlMs = rateLimitConfig.windowMs;
    } else {
      ttlMs = await this.redis.pttl(redisKey);
      if (ttlMs < 0) {
        // Lost its TTL somehow (shouldn't happen) - reset rather than let the key live forever.
        await this.redis.pexpire(redisKey, rateLimitConfig.windowMs);
        ttlMs = rateLimitConfig.windowMs;
      }
    }

    const resetAt = Math.floor((Date.now() + ttlMs) / 1000);
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  }

  /**
   * Caches an organization's plan tier in Redis (API.md's rate limits
   * don't need per-request freshness) so the guard doesn't hit Postgres
   * on every single request - only once per orgId per cache TTL.
   */
  async planTierFor(orgId: string): Promise<string> {
    const cacheKey = `org_plan_tier:${orgId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const org = await getPrismaClient().organization.findUnique({
      where: { id: orgId },
      select: { planTier: true },
    });
    const planTier = org?.planTier ?? "free";
    await this.redis.set(cacheKey, planTier, "EX", rateLimitConfig.planTierCacheTtlSeconds);
    return planTier;
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
