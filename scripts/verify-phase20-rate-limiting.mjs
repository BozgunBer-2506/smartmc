import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `phase20-ratelimit-${randomBytes(6).toString("hex")}@example.com`;
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

async function req(method, url, accessToken, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
}

/**
 * Real rate limiting (docs/ROADMAP.md Phase 20.1, docs/API.md Section 9) -
 * exercises the actual Redis-backed guard end to end: headers present on
 * every request (not just when limited), a 429 with the documented RFC
 * 7807 shape once the window's limit is exceeded, the AI endpoint bucket
 * being separate (and tighter) from the general one for the same
 * workspace, and health/dev endpoints staying exempt. Uses the real free-
 * tier limits from apps/api/src/config/rate-limit.config.ts (60/min
 * general, 30/min AI) - if those numbers change, update here too.
 */
async function main() {
  const register = await req("POST", `${BASE}/v1/auth/register`, undefined, { email, password });
  check("register succeeds (fresh free-tier workspace)", register.status === 201);
  const accessToken = register.body.accessToken;

  // 1. Headers present on a normal, well-within-budget request.
  const first = await req("GET", `${BASE}/v1/users/me`, accessToken);
  check("X-RateLimit-Limit header present on a normal request", first.headers.get("x-ratelimit-limit") === "60");
  check("X-RateLimit-Remaining present and counting down", Number(first.headers.get("x-ratelimit-remaining")) === 59);
  check("X-RateLimit-Reset present as a future unix timestamp", Number(first.headers.get("x-ratelimit-reset")) > Date.now() / 1000);

  // 2. The general per-workspace bucket actually enforces its limit (free tier: 60/min).
  let sawGeneral429 = false;
  let generalBody;
  for (let i = 0; i < 65; i += 1) {
    const res = await req("GET", `${BASE}/v1/users/me`, accessToken);
    if (res.status === 429) {
      sawGeneral429 = true;
      generalBody = res.body;
      break;
    }
  }
  check("general endpoint eventually returns 429 once the free-tier limit (60/min) is exceeded", sawGeneral429);
  check("429 body matches RFC 7807 shape with the RATE_LIMITED code", generalBody?.code === "RATE_LIMITED" && generalBody?.status === 429);

  // 3. A fresh workspace's AI bucket is independent and tighter (free tier: 10/min) -
  // register a new user so the general bucket above doesn't interfere.
  const email2 = `phase20-ratelimit-ai-${randomBytes(6).toString("hex")}@example.com`;
  const register2 = await req("POST", `${BASE}/v1/auth/register`, undefined, { email: email2, password });
  const accessToken2 = register2.body.accessToken;

  let aiCallsBeforeLimited = 0;
  let sawAi429 = false;
  for (let i = 0; i < 33; i += 1) {
    const res = await req("GET", `${BASE}/v1/ai/credits/balance`, accessToken2);
    if (res.status === 429) {
      sawAi429 = true;
      break;
    }
    aiCallsBeforeLimited += 1;
  }
  check("AI endpoint enforces its own, tighter limit (free tier: 30/min)", sawAi429 && aiCallsBeforeLimited === 30);

  // 4. The general bucket for that same (AI-limited) workspace is untouched -
  // proves the AI and general buckets are genuinely separate counters.
  const generalStillOk = await req("GET", `${BASE}/v1/users/me`, accessToken2);
  check(
    "the same workspace's general bucket is unaffected by its exhausted AI bucket",
    generalStillOk.status === 200 && Number(generalStillOk.headers.get("x-ratelimit-remaining")) === 59,
  );

  // 5. Health/dev endpoints are exempt outright (no header, no counting).
  const health = await req("GET", `${BASE}/health`);
  check("/health is exempt from rate limiting (no X-RateLimit headers)", health.headers.get("x-ratelimit-limit") === null);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
