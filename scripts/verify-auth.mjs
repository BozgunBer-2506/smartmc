import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `verify-${randomBytes(6).toString("hex")}@example.com`;
const password = `Vf9${randomBytes(12).toString("hex")}Zq`;

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

function extractCookie(setCookieHeader) {
  const match = /smc_refresh=([^;]+)/.exec(setCookieHeader ?? "");
  return match?.[1];
}

async function main() {
  // 1. Register
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  check("register issues an access token", typeof registerBody.accessToken === "string");
  let refresh = extractCookie(registerRes.headers.get("set-cookie"));
  check("register sets the refresh cookie", Boolean(refresh));

  // 2. Duplicate registration is rejected
  const dupeRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const dupeBody = await dupeRes.json();
  check("duplicate registration returns 409", dupeRes.status === 409);
  check("duplicate registration has code EMAIL_ALREADY_REGISTERED", dupeBody.code === "EMAIL_ALREADY_REGISTERED");

  // 3. Protected route rejects missing token
  const noTokenRes = await fetch(`${BASE}/v1/users/me`);
  check("GET /v1/users/me without token returns 401", noTokenRes.status === 401);

  // 4. Login
  const loginRes = await fetch(`${BASE}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await loginRes.json();
  check("login returns 200", loginRes.status === 200);
  const accessToken = loginBody.accessToken;
  refresh = extractCookie(loginRes.headers.get("set-cookie"));

  // 5. Protected route accepts valid token
  const meRes = await fetch(`${BASE}/v1/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meBody = await meRes.json();
  check("GET /v1/users/me with token returns 200", meRes.status === 200);
  check("GET /v1/users/me returns the registered email", meBody.user?.email === email);
  check("workspace was auto-created with role owner", meBody.workspaces?.[0]?.role === "owner");

  // 6. Refresh rotation
  const refreshRes = await fetch(`${BASE}/v1/auth/refresh`, {
    method: "POST",
    headers: { Cookie: `smc_refresh=${refresh}` },
  });
  const refreshBody = await refreshRes.json();
  const newRefresh = extractCookie(refreshRes.headers.get("set-cookie"));
  check("refresh returns 200", refreshRes.status === 200);
  check("refresh issues a new access token", typeof refreshBody.accessToken === "string");
  check("refresh rotates the refresh token", newRefresh !== refresh);

  // 7. Reuse detection: presenting the OLD (already-rotated) token again
  const reuseRes = await fetch(`${BASE}/v1/auth/refresh`, {
    method: "POST",
    headers: { Cookie: `smc_refresh=${refresh}` },
  });
  const reuseBody = await reuseRes.json();
  check("presenting a rotated-away token returns 401", reuseRes.status === 401);
  check("reuse is reported as REFRESH_TOKEN_REUSE_DETECTED", reuseBody.code === "REFRESH_TOKEN_REUSE_DETECTED");

  // 8. Reuse detection revokes the WHOLE family - the new token is dead too
  const familyDeadRes = await fetch(`${BASE}/v1/auth/refresh`, {
    method: "POST",
    headers: { Cookie: `smc_refresh=${newRefresh}` },
  });
  check("reuse detection also revoked the rotated-to session", familyDeadRes.status === 401);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
