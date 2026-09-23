/**
 * Auth configuration, read directly from env with documented defaults -
 * matching this codebase's existing pattern (see events/redis-connection.ts)
 * rather than introducing a config-management library for a handful of values.
 */
export const authConfig = {
  jwtSecret: process.env.JWT_SECRET ?? "dev-insecure-secret-change-me",
  accessTokenTtlSeconds: 15 * 60, // 15 min - ARCHITECTURE.md Section 6, SECURITY.md Section 4.3
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30), // 7-30 days - ARCHITECTURE.md Section 6
  refreshCookieName: "smc_refresh",
  refreshCookiePath: "/v1/auth",
  /**
   * "none" is required whenever apps/web and apps/api are on different
   * sites per the Public Suffix List (e.g. Railway's *.up.railway.app
   * subdomains) - "strict"/"lax" silently drop the cookie on the
   * cross-site fetch to /v1/auth/refresh. Defaults by NODE_ENV so
   * existing deploys need no new env var, but is explicitly overridable
   * (AUTH_COOKIE_SAMESITE=none|lax|strict) for topologies NODE_ENV can't
   * predict - a custom apex/subdomain split, a staging environment, etc.
   */
  refreshCookieSameSite: (process.env.AUTH_COOKIE_SAMESITE ??
    (process.env.NODE_ENV === "production" ? "none" : "strict")) as "none" | "lax" | "strict",
  // Account lockout window/threshold - SECURITY.md Section 4.1
  loginLockoutWindowSeconds: Number(process.env.LOGIN_LOCKOUT_WINDOW_SECONDS ?? 15 * 60),
  loginLockoutMaxAttempts: Number(process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS ?? 10),
  // Auth Reliability Hardening - forgot/reset-password.
  passwordResetTokenTtlMinutes: Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? 30),
  passwordResetLockoutWindowSeconds: Number(process.env.PASSWORD_RESET_LOCKOUT_WINDOW_SECONDS ?? 15 * 60),
  passwordResetLockoutMaxAttempts: Number(process.env.PASSWORD_RESET_LOCKOUT_MAX_ATTEMPTS ?? 5),
  /** Where the reset link points a user's browser at - the web app, not this API. */
  webAppBaseUrl: () => process.env.WEB_APP_BASE_URL ?? "http://localhost:3000",
};
