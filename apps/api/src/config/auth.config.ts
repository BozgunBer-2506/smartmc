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
  // Account lockout window/threshold - SECURITY.md Section 4.1
  loginLockoutWindowSeconds: Number(process.env.LOGIN_LOCKOUT_WINDOW_SECONDS ?? 15 * 60),
  loginLockoutMaxAttempts: Number(process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS ?? 10),
};
