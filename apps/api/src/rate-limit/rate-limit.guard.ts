import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import type { Request, Response } from "express";
import { rateLimitConfig } from "../config/rate-limit.config";
import { httpError } from "../common/http-error";
import { TokenService } from "../auth/token.service";
import { RateLimitService } from "./rate-limit.service";

/**
 * Global rate limiting (API.md Section 9, ROADMAP.md Phase 20.1) -
 * `LoginThrottleService` already exists but only ever covered
 * failed-login brute-force protection; every other endpoint, including
 * every credit-consuming `/v1/ai/*` call, had no request-volume ceiling
 * at all before this (found by the MVP Hardening pass,
 * docs/reviews/mvp-hardening-report.md).
 *
 * Runs as an APP_GUARD (global), independent of JwtAuthGuard's per-route
 * placement - it needs to run on unauthenticated routes too (login,
 * register), so it verifies the bearer token itself rather than relying
 * on `request.user` having already been set by a route-level guard that
 * may not exist on this route or may not have run yet.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  // Health checks and dev-only tooling are excluded outright. Provider-
  // called webhook/OAuth-callback endpoints are excluded too - they're
  // authenticated via signature (Slack/Telegram) or aren't user-credential-
  // driven at all (OAuth callbacks), not a bearer token - but connect/
  // disconnect on the same controllers ARE normal JWT-protected user
  // endpoints and must stay rate-limited, so this matches specific
  // sub-paths, not the whole /v1/connectors/* prefix.
  private static readonly EXCLUDED_PREFIXES = ["/health", "/dev/"];
  private static readonly EXCLUDED_PATTERNS = [/^\/v1\/connectors\/telegram\/webhook\//, /^\/v1\/connectors\/slack\/events$/, /^\/v1\/connectors\/slack\/callback$/, /^\/v1\/connectors\/discord\/callback$/];

  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    if (
      RateLimitGuard.EXCLUDED_PREFIXES.some((prefix) => request.path.startsWith(prefix)) ||
      RateLimitGuard.EXCLUDED_PATTERNS.some((pattern) => pattern.test(request.path))
    ) {
      return true;
    }

    const isAiEndpoint = request.path.startsWith("/v1/ai/");
    const { key, tier } = await this.resolveIdentity(request);
    const limit = isAiEndpoint ? tier.aiRequestsPerMinute : tier.requestsPerMinute;
    const bucketKey = isAiEndpoint ? `${key}:ai` : key;

    const result = await this.rateLimitService.consume(bucketKey, limit);

    // Headers on every request, not just when limited (API.md Section 9) -
    // so well-behaved clients can self-throttle before ever seeing a 429.
    response.setHeader("X-RateLimit-Limit", String(result.limit));
    response.setHeader("X-RateLimit-Remaining", String(result.remaining));
    response.setHeader("X-RateLimit-Reset", String(result.resetAt));

    if (!result.allowed) {
      response.setHeader("Retry-After", String(Math.max(0, result.resetAt - Math.floor(Date.now() / 1000))));
      throw httpError(
        HttpStatus.TOO_MANY_REQUESTS,
        "RATE_LIMITED",
        "Too many requests. Slow down and retry after the window resets.",
      );
    }

    return true;
  }

  private async resolveIdentity(request: Request): Promise<{ key: string; tier: ReturnType<typeof rateLimitConfig.tierFor> }> {
    const token = this.tokenService.extractBearerToken(request.headers.authorization);
    if (token) {
      try {
        const claims = await this.tokenService.verify(token);
        const planTier = await this.rateLimitService.planTierFor(claims.orgId);
        return { key: `workspace:${claims.workspaceId}`, tier: rateLimitConfig.tierFor(planTier) };
      } catch {
        // Falls through to IP-based anonymous limiting - an invalid/expired
        // token still gets a request-volume ceiling, just the tightest one.
      }
    }
    return { key: `ip:${request.ip ?? "unknown"}`, tier: rateLimitConfig.anonymousTier };
  }
}
