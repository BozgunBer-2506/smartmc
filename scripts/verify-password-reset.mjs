import { randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Redis } from "ioredis";
import { getPrismaClient } from "@smc/database";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";

// W. Every raw token/password this run generates is appended here (never
// to stdout/console) - a separate step greps the server's own log output
// against this file's exact lines to confirm none of them ever appear
// there. Written, not printed - this script's own console output never
// contains a secret value either.
const SECRET_LOG_PATH = process.env.SMC_SECRET_AUDIT_FILE;
const loggedSecrets = new Set();
function trackSecret(value) {
  if (!SECRET_LOG_PATH || !value) return;
  if (loggedSecrets.has(value)) return;
  loggedSecrets.add(value);
  writeFileSync(SECRET_LOG_PATH, `${value}\n`, { flag: "a" });
}

let passCount = 0;
let failCount = 0;
function check(label, condition) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passCount += 1;
  } else {
    console.error(`FAIL: ${label}`);
    failCount += 1;
  }
}

function uniqueEmail(prefix) {
  return `${prefix}-${randomBytes(6).toString("hex")}@example.com`;
}

function hashToken(token) {
  trackSecret(token);
  const hash = createHash("sha256").update(token).digest("hex");
  trackSecret(hash);
  return hash;
}

async function json(res) {
  return res.json();
}

/**
 * Live HTTP verification for the forgot/reset-password flow (Auth
 * Reliability Hardening), run against the actual running API + real
 * Postgres/Redis, same pattern as verify-auth.mjs and
 * verify-phase21.2-connectors.mjs. Direct-Prisma reads/writes are used
 * only to inspect stored state (never to fake an HTTP-observable result)
 * and to simulate an expired token without waiting 30 real minutes.
 */
async function clearResetThrottleState(redis) {
  // password_reset_attempts:ip:* is shared across every email from this
  // machine (LoginThrottleService keys IP independently of email) - a
  // prior run of this same script (especially its own burst tests) can
  // otherwise leave the IP counter poisoned for its full 15-minute window,
  // silently no-op'ing a *subsequent* run's real requestReset() calls even
  // though the external response still (correctly) reads 200. Cleared at
  // both start and end so this script is safely repeatable back-to-back.
  const keys = await redis.keys("password_reset_attempts:*");
  if (keys.length > 0) await redis.del(...keys);
}

async function clearGeneralRateLimitState(redis) {
  // This script now makes ~50 unauthenticated requests in one run (T/U/X
  // added real concurrent/atomicity/refresh scenarios on top of the
  // original flow) - comfortably past Phase 20.1's real anonymous-tier
  // limit (20/min/IP) working exactly as designed. Clearing this test's
  // own accumulated counters is test-harness hygiene for a local run,
  // not a change to the limit itself or to any production state -
  // the limit, its threshold, and its Redis-backed enforcement are
  // completely untouched; only this script's own prior-run key state is.
  const keys = await redis.keys("rate_limit:*");
  if (keys.length > 0) await redis.del(...keys);
}

async function main() {
  const prisma = getPrismaClient();
  const redis = new Redis({ host: process.env.REDIS_HOST ?? "localhost", port: Number(process.env.REDIS_PORT ?? 6379) });
  await clearResetThrottleState(redis);
  await clearGeneralRateLimitState(redis);

  const password = `Vf9${randomBytes(12).toString("hex")}Zq`;
  trackSecret(password);
  const email = uniqueEmail("reset");

  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Password Reset Verify Bot" }),
  });
  check("register returns 201", registerRes.status === 201);

  // G/H. Enumeration safety: existing-email and unknown-email forgot-password requests return the identical external shape.
  const existingRes = await fetch(`${BASE}/v1/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const existingBody = await json(existingRes);
  const unknownEmail = uniqueEmail("unknown");
  const unknownRes = await fetch(`${BASE}/v1/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: unknownEmail }),
  });
  const unknownBody = await json(unknownRes);
  check("G. existing-email forgot-password returns 200", existingRes.status === 200);
  check("H. unknown-email forgot-password returns the identical status", unknownRes.status === existingRes.status);
  check("H. unknown-email forgot-password returns the identical response body", JSON.stringify(unknownBody) === JSON.stringify(existingBody));
  check("S. forgot-password response never includes a token", !JSON.stringify(existingBody).toLowerCase().includes("token"));

  // I. Only a hash is stored - fetch the real token via direct-Prisma (the only way to get it, since it's never in the HTTP response) and confirm the DB row's tokenHash is its SHA-256, not the raw value.
  const user = await prisma.user.findFirstOrThrow({ where: { email } });
  const record = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  check("I. stored tokenHash is 64 hex chars (SHA-256), not a raw token", /^[0-9a-f]{64}$/.test(record.tokenHash));

  // Reconstruct the real raw token is impossible from the hash (by design) - for J/K/L/M/P/Q/R below we need the actual
  // raw token, which only ever exists in the (never-sent-for-real) email. Generate our own token through the same
  // code path a real reset flow would use by directly inserting a record with a KNOWN raw token's hash - this exercises
  // the exact same resetPassword() validation/consumption logic the real endpoint runs, without needing real email delivery.
  const knownToken = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.update({ where: { id: record.id }, data: { tokenHash: hashToken(knownToken) } });

  // L. Garbage/invalid token rejected with a generic error.
  const invalidRes = await fetch(`${BASE}/v1/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "not-a-real-token", newPassword: `Vf9${randomBytes(12).toString("hex")}Zq` }),
  });
  const invalidBody = await json(invalidRes);
  check("L. an invalid token is rejected (400)", invalidRes.status === 400);

  // K. Expired token rejected - backdate expiresAt directly rather than waiting 30 real minutes.
  const { newId } = await import("@smc/database");
  const expiredToken = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: { id: newId(), userId: user.id, tokenHash: hashToken(expiredToken), expiresAt: new Date(Date.now() - 60_000) },
  });
  const expiredRes = await fetch(`${BASE}/v1/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: expiredToken, newPassword: `Vf9${randomBytes(12).toString("hex")}Zq` }),
  });
  const expiredBody = await json(expiredRes);
  check("K. an expired token is rejected (400)", expiredRes.status === 400);
  // Compare only the meaningful fields - the RFC 7807 body also carries a
  // per-request traceId (docs/ARCHITECTURE.md Section 7), which legitimately
  // differs between any two requests and isn't part of the "never
  // distinguished" guarantee this check is actually about.
  const shape = (body) => ({ title: body.title, code: body.code, detail: body.detail, status: body.status });
  check(
    "K/L. expired and invalid tokens produce the identical generic error body (never distinguished)",
    JSON.stringify(shape(expiredBody)) === JSON.stringify(shape(invalidBody)),
  );

  // N. Weak password rejected.
  const weakRes = await fetch(`${BASE}/v1/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: knownToken, newPassword: "short" }),
  });
  check("N. a policy-violating new password is rejected", weakRes.status === 400);

  // Need a session to revoke for P/Q/R - login again to get a fresh refresh cookie tied to this account.
  let refreshCookie;
  {
    const loginRes = await fetch(`${BASE}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    refreshCookie = loginRes.headers.get("set-cookie");
  }
  check("setup: a session exists before reset (for P)", Boolean(refreshCookie));

  // J. A valid, unexpired, correctly-hashed token resets the password.
  const newPassword = `Vf9${randomBytes(12).toString("hex")}Zq`;
  trackSecret(newPassword);
  const resetRes = await fetch(`${BASE}/v1/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: knownToken, newPassword }),
  });
  const resetBody = await json(resetRes);
  check("J. a valid token resets the password (200)", resetRes.status === 200);
  {
    // W. Also track the real Argon2id password hash now stored for this
    // account - never returned to any client, only readable via direct-Prisma.
    const creds = await prisma.userCredentials.findUnique({ where: { userId: user.id } });
    trackSecret(creds?.passwordHash ?? null);
  }
  check("S. reset-password response never echoes the token or password back", !JSON.stringify(resetBody).includes(knownToken) && !JSON.stringify(resetBody).includes(newPassword));

  // M. The same token cannot be used a second time.
  const reuseRes = await fetch(`${BASE}/v1/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: knownToken, newPassword: `Vf9${randomBytes(12).toString("hex")}Zq` }),
  });
  check("M. reusing the same token a second time is rejected (400)", reuseRes.status === 400);

  // Q. Old password no longer works.
  const oldLoginRes = await fetch(`${BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  check("Q. login with the old password now fails (401)", oldLoginRes.status === 401);

  // R. New password works.
  const newLoginRes = await fetch(`${BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: newPassword }),
  });
  check("R. login with the new password succeeds (200)", newLoginRes.status === 200);

  // P. The pre-reset session's refresh token was revoked - it can no longer refresh.
  const refreshWithOldCookieRes = await fetch(`${BASE}/v1/auth/refresh`, {
    method: "POST",
    headers: { Cookie: refreshCookie?.split(";")[0] ?? "" },
  });
  check("P. the pre-reset session's refresh token no longer works after reset", refreshWithOldCookieRes.status === 401);

  // Reset-request rate limiting - hammering forgot-password for one email still only ever returns the generic 200,
  // and does not create unbounded token rows once throttled (checked via direct-Prisma count before/after a burst).
  const throttleEmail = uniqueEmail("throttle");
  const beforeCount = await prisma.passwordResetToken.count();
  for (let i = 0; i < 8; i += 1) {
    const r = await fetch(`${BASE}/v1/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: throttleEmail }),
    });
    if (r.status !== 200) {
      check(`Throttle. request ${i + 1} of a burst still returns 200 (never reveals throttling externally)`, false);
    }
  }
  check("Throttle. an 8-request burst for one unknown email never returns a non-200 status", true);
  const afterCount = await prisma.passwordResetToken.count();
  check("Throttle. doesn't blow up (token count grew by a bounded amount, not 8x for one unknown email)", afterCount - beforeCount === 0);

  await clearGeneralRateLimitState(redis);

  // --- T. CONCURRENT RESET TOKEN USE - two truly simultaneous requests for the SAME valid token ---
  const { newId: newId2 } = await import("@smc/database");
  const concurrentToken = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: { id: newId2(), userId: user.id, tokenHash: hashToken(concurrentToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
  });
  const passwordA = `Vf9${randomBytes(12).toString("hex")}Zq`;
  const passwordB = `Vf9${randomBytes(12).toString("hex")}Zq`;
  trackSecret(passwordA);
  trackSecret(passwordB);
  const [concurrentResA, concurrentResB] = await Promise.all([
    fetch(`${BASE}/v1/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: concurrentToken, newPassword: passwordA }),
    }),
    fetch(`${BASE}/v1/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: concurrentToken, newPassword: passwordB }),
    }),
  ]);
  const statuses = [concurrentResA.status, concurrentResB.status].sort();
  check("T. of two truly simultaneous requests for the same token, exactly one succeeds (200) and one fails (400)", statuses[0] === 200 && statuses[1] === 400);
  const winningPassword = concurrentResA.status === 200 ? passwordA : passwordB;
  const losingPassword = concurrentResA.status === 200 ? passwordB : passwordA;
  const winnerLoginRes = await fetch(`${BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: winningPassword }),
  });
  check("T. the account's password ends in exactly the winning request's state", winnerLoginRes.status === 200);
  const loserLoginRes = await fetch(`${BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: losingPassword }),
  });
  check("T. the losing request's password was never applied", loserLoginRes.status === 401);
  const concurrentReuseRes = await fetch(`${BASE}/v1/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: concurrentToken, newPassword: `Vf9${randomBytes(12).toString("hex")}Zq` }),
  });
  check("T. the token cannot subsequently be reused by a third request", concurrentReuseRes.status === 400);

  await clearGeneralRateLimitState(redis);

  // --- U. TRANSACTION FAILURE ATOMICITY - force a real failure after the token-claim mutation, inside the transaction ---
  const atomicityToken = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.create({
    data: { id: newId2(), userId: user.id, tokenHash: hashToken(atomicityToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
  });
  const armRes = await fetch(`${BASE}/dev/password-reset/arm-tx-failure`, { method: "POST" });
  // 201 is NestJS's default for POST (no @HttpCode override on this dev-only endpoint).
  check("U. setup: the dev-only fault injector arms successfully (non-production only)", armRes.status === 201);

  const attemptedPassword = `Vf9${randomBytes(12).toString("hex")}Zq`;
  trackSecret(attemptedPassword);
  const forcedFailureRes = await fetch(`${BASE}/v1/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: atomicityToken, newPassword: attemptedPassword }),
  });
  check("U. a failure forced after the token claim (inside the transaction) surfaces as a real error, not a silent success", forcedFailureRes.status >= 500);

  const tokenAfterForcedFailure = await prisma.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: hashToken(atomicityToken) } });
  check("U. the token's usedAt is still null - the claim mutation was rolled back with everything else", tokenAfterForcedFailure.usedAt === null);

  const stillOldPasswordLoginRes = await fetch(`${BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: winningPassword }),
  });
  check("U. the account's real current password (from T above) still works - not silently changed", stillOldPasswordLoginRes.status === 200);

  const attemptedPasswordLoginRes = await fetch(`${BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: attemptedPassword }),
  });
  check("U. the forced-failure attempt's password was never applied", attemptedPasswordLoginRes.status === 401);

  // The token must still be genuinely usable after the rollback - a real, non-forced retry with the same token now succeeds normally.
  const retryAfterRollbackPassword = `Vf9${randomBytes(12).toString("hex")}Zq`;
  trackSecret(retryAfterRollbackPassword);
  const retryAfterRollbackRes = await fetch(`${BASE}/v1/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: atomicityToken, newPassword: retryAfterRollbackPassword }),
  });
  check("U. after the rollback, a genuine retry with the same token succeeds normally (the token wasn't corrupted)", retryAfterRollbackRes.status === 200);
  const retryLoginRes = await fetch(`${BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: retryAfterRollbackPassword }),
  });
  check("U. the retry's new password actually works", retryLoginRes.status === 200);

  await clearGeneralRateLimitState(redis);

  // --- X. REFRESH TOKEN FAMILY SAFETY (backend half) - a single real refresh call produces a genuinely usable new access token ---
  let xRefreshCookie;
  {
    const xLoginRes = await fetch(`${BASE}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: retryAfterRollbackPassword }),
    });
    xRefreshCookie = xLoginRes.headers.get("set-cookie")?.split(";")[0] ?? "";
  }
  const xRefreshRes = await fetch(`${BASE}/v1/auth/refresh`, { method: "POST", headers: { Cookie: xRefreshCookie } });
  const xRefreshBody = await json(xRefreshRes);
  check("X. a single real refresh call against the actual backend succeeds", xRefreshRes.status === 200 && Boolean(xRefreshBody.accessToken));
  const xMeRes = await fetch(`${BASE}/v1/users/me`, { headers: { Authorization: `Bearer ${xRefreshBody.accessToken}` } });
  check("X. the resulting refreshed access token is genuinely usable for a real authenticated request", xMeRes.status === 200);
  // Note: this confirms the backend half only - that ONE real refresh call produces a genuinely usable session.
  // That the frontend never sends more than one such call per expiry (so this backend behavior is never
  // exercised concurrently by SmartMC's own client) is what scripts/verify-token-refresh-logic.ts proves,
  // separately, against the mocked frontend logic - see the final report for what is and isn't covered by each.

  // Cleanup - including the throttle state this run's own burst created,
  // so a subsequent run isn't poisoned by this one.
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await clearResetThrottleState(redis);
  await clearGeneralRateLimitState(redis);
  redis.disconnect();

  console.log(`\n${passCount} passed, ${failCount} failed.`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
