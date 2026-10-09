/**
 * Regression checks for the two auth-security P0 fixes:
 * 1. JWT_SECRET never falls back to the public development value in
 *    production, and boot fails fast when it is missing.
 * 2. Credentialed CORS only echoes explicitly configured web-app origins
 *    (REST via Nest's enableCors, realtime via socket.io's origin callback).
 * Tests the exported config functions directly plus one real Nest HTTP
 * server for the CORS headers - no database or Redis needed.
 */
import "reflect-metadata";
import path from "node:path";
import { assertJwtSecretValid, resolveJwtSecret } from "../apps/api/src/config/auth.config";
import { resolveAllowedOrigins } from "../apps/api/src/config/cors.config";

let passCount = 0;
let failCount = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passCount += 1;
  } else {
    console.error(`FAIL: ${label}`);
    failCount += 1;
  }
}

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

function captureWarn(fn: () => void): string[] {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return warnings;
}

const STRONG = "x".repeat(48);
const DEV_DEFAULT = "dev-insecure-secret-change-me";

function verifyJwt() {
  check("production + unset JWT_SECRET resolves to empty, never the dev fallback", resolveJwtSecret({ NODE_ENV: "production" }) === "");
  check("development + unset JWT_SECRET keeps the local dev fallback", resolveJwtSecret({ NODE_ENV: "development" }) === DEV_DEFAULT);
  check("a configured secret is used exactly as-is (existing sessions stay valid)", resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: ` ${STRONG} ` }) === ` ${STRONG} `);

  check("production boot fails when JWT_SECRET is unset", throws(() => assertJwtSecretValid({ NODE_ENV: "production" })));
  check("production boot fails when JWT_SECRET is blank", throws(() => assertJwtSecretValid({ NODE_ENV: "production", JWT_SECRET: "   " })));
  check("production boot fails when JWT_SECRET is the public dev value", throws(() => assertJwtSecretValid({ NODE_ENV: "production", JWT_SECRET: DEV_DEFAULT })));
  check("production boot passes with a strong configured secret", !throws(() => assertJwtSecretValid({ NODE_ENV: "production", JWT_SECRET: STRONG })));

  let shortThrew = false;
  const warnings = captureWarn(() => {
    shortThrew = throws(() => assertJwtSecretValid({ NODE_ENV: "production", JWT_SECRET: "short-but-real-secret" }));
  });
  check("a short existing production secret warns instead of forcing a rotation", !shortThrew && warnings.length === 1);
  check("non-production boot never fails on JWT_SECRET", !throws(() => assertJwtSecretValid({ NODE_ENV: "development" })));
}

function verifyCorsResolution() {
  check("production with no configured origin fails at boot", throws(() => resolveAllowedOrigins({ NODE_ENV: "production" })));
  const fromWebApp = resolveAllowedOrigins({ NODE_ENV: "production", WEB_APP_BASE_URL: "https://app.example.test/some/path/" });
  check("WEB_APP_BASE_URL is normalized to its origin", fromWebApp.length === 1 && fromWebApp[0] === "https://app.example.test");
  check("production rejects a non-HTTPS origin", throws(() => resolveAllowedOrigins({ NODE_ENV: "production", WEB_APP_BASE_URL: "http://app.example.test" })));
  check("wildcard origins are rejected", throws(() => resolveAllowedOrigins({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "*" })));
  check("wildcard subdomains are rejected", throws(() => resolveAllowedOrigins({ NODE_ENV: "development", CORS_ALLOWED_ORIGINS: "https://*.example.test" })));
  check("malformed origins are rejected", throws(() => resolveAllowedOrigins({ NODE_ENV: "development", CORS_ALLOWED_ORIGINS: "not a url" })));
  const merged = resolveAllowedOrigins({
    NODE_ENV: "production",
    WEB_APP_BASE_URL: "https://app.example.test",
    CORS_ALLOWED_ORIGINS: " https://app.example.test , https://admin.example.test ",
  });
  check("CORS_ALLOWED_ORIGINS merges with WEB_APP_BASE_URL and de-duplicates", merged.join(",") === "https://app.example.test,https://admin.example.test");
  const dev = resolveAllowedOrigins({ NODE_ENV: "development" });
  check("development defaults to the apps/web dev server only", dev.join(",") === "http://localhost:3000,http://127.0.0.1:3000");
}

function verifySocketCallback() {
  const modPath = require.resolve("../apps/api/src/config/cors.config");
  delete require.cache[modPath];
  const prev = { NODE_ENV: process.env.NODE_ENV, WEB_APP_BASE_URL: process.env.WEB_APP_BASE_URL, CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS };
  process.env.NODE_ENV = "production";
  process.env.WEB_APP_BASE_URL = "https://app.example.test";
  delete process.env.CORS_ALLOWED_ORIGINS;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { socketCorsOrigin } = require(modPath) as typeof import("../apps/api/src/config/cors.config");
    const ask = (origin: string | undefined) => {
      let allowed: boolean | undefined;
      socketCorsOrigin(origin, (_err, allow) => (allowed = allow));
      return allowed;
    };
    check("socket.io allows the configured web origin", ask("https://app.example.test") === true);
    check("socket.io rejects a foreign origin", ask("https://attacker.example") === false);
    check("socket.io leaves non-browser clients (no Origin) alone", ask(undefined) === true);
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[modPath];
  }
}

async function verifyCorsHeadersOverHttp() {
  const apiDir = path.resolve(__dirname, "../apps/api");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { NestFactory } = require(require.resolve("@nestjs/core", { paths: [apiDir] }));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Module } = require(require.resolve("@nestjs/common", { paths: [apiDir] }));
  class EmptyModule {}
  Module({})(EmptyModule);

  const allowed = resolveAllowedOrigins({ NODE_ENV: "production", WEB_APP_BASE_URL: "https://app.example.test" });
  const app = await NestFactory.create(EmptyModule, { logger: false });
  app.enableCors({ origin: allowed, credentials: true });
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  try {
    const preflight = (origin?: string) =>
      fetch(`${base}/v1/auth/refresh`, {
        method: "OPTIONS",
        headers: { ...(origin ? { Origin: origin } : {}), "Access-Control-Request-Method": "POST" },
      });

    const ok = await preflight("https://app.example.test");
    check("allowed origin gets an exact Access-Control-Allow-Origin", ok.headers.get("access-control-allow-origin") === "https://app.example.test");
    check("allowed origin keeps credentialed CORS (refresh cookie)", ok.headers.get("access-control-allow-credentials") === "true");

    const evil = await preflight("https://attacker.example");
    check("foreign origin is not echoed back (cannot read refreshed tokens)", evil.headers.get("access-control-allow-origin") === null);

    const none = await preflight();
    check("request without Origin gets no CORS grant", none.headers.get("access-control-allow-origin") === null);
  } finally {
    await app.close();
  }
}

async function main() {
  verifyJwt();
  verifyCorsResolution();
  verifySocketCallback();
  await verifyCorsHeadersOverHttp();
  console.log(`\n${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
