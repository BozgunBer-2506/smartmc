/**
 * Credentialed CORS allowlist for the REST API and the realtime gateway.
 *
 * The refresh-token cookie is `SameSite=None` in production (auth.config.ts),
 * so reflecting any request Origin with `credentials: true` would let any
 * website a signed-in user visits call `POST /v1/auth/refresh` and read the
 * returned access token. Only explicitly configured web-app origins are
 * allowed instead - never a reflected or wildcard origin.
 *
 * Sources (merged, de-duplicated):
 * - `WEB_APP_BASE_URL` - the web app's own URL, already required for
 *   password-reset links (auth.config.ts), so a correctly configured deploy
 *   needs no new variable.
 * - `CORS_ALLOWED_ORIGINS` - optional comma-separated extra origins.
 *
 * Production refuses to start when no valid origin is configured, rather
 * than silently allowing everything or nothing. Outside production the
 * apps/web dev server (`next dev -p 3000`) is the default.
 */
const DEV_DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

type Env = Record<string, string | undefined>;

function normalizeOrigin(raw: string, isProduction: boolean, source: string): string {
  if (raw.includes("*")) {
    throw new Error(`${source} contains a wildcard origin ("${raw}") - credentialed CORS requires explicit origins.`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${source} contains an invalid origin: "${raw}".`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${source} contains a non-HTTP origin: "${raw}".`);
  }
  if (isProduction && url.protocol !== "https:") {
    throw new Error(`${source} contains a non-HTTPS origin in production: "${raw}".`);
  }
  return url.origin;
}

export function resolveAllowedOrigins(env: Env = process.env): string[] {
  const isProduction = env.NODE_ENV === "production";
  const origins = new Set<string>();

  const webApp = env.WEB_APP_BASE_URL?.trim();
  if (webApp) origins.add(normalizeOrigin(webApp, isProduction, "WEB_APP_BASE_URL"));

  for (const entry of (env.CORS_ALLOWED_ORIGINS ?? "").split(",")) {
    const trimmed = entry.trim();
    if (trimmed) origins.add(normalizeOrigin(trimmed, isProduction, "CORS_ALLOWED_ORIGINS"));
  }

  if (origins.size === 0) {
    if (isProduction) {
      throw new Error(
        "No CORS origin configured. Set WEB_APP_BASE_URL (and optionally CORS_ALLOWED_ORIGINS) to the web app's " +
          "https origin - refusing to start in production with an open or empty credentialed CORS policy.",
      );
    }
    DEV_DEFAULT_ORIGINS.forEach((origin) => origins.add(origin));
  }

  return [...origins];
}

let cachedOrigins: string[] | undefined;

export const corsConfig = {
  /** Resolves (and validates) once - call at boot so a misconfiguration fails before the server binds. */
  allowedOrigins(): string[] {
    if (!cachedOrigins) cachedOrigins = resolveAllowedOrigins();
    return cachedOrigins;
  },

  /**
   * Requests without an Origin header (server-to-server, webhooks, curl) are
   * not browser cross-origin requests - CORS headers are irrelevant to them,
   * so they are not rejected here.
   */
  isAllowedOrigin(origin: string | undefined): boolean {
    return origin === undefined || corsConfig.allowedOrigins().includes(origin);
  },
};

/** socket.io's `cors.origin` callback form - same allowlist as the REST API. */
export function socketCorsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void {
  callback(null, corsConfig.isAllowedOrigin(origin));
}
