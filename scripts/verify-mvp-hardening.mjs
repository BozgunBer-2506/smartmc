import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `hardening-${randomBytes(6).toString("hex")}@example.com`;
const password = `Vf9${randomBytes(12).toString("hex")}Zq`;

let passCount = 0;
let failCount = 0;
const timings = [];

function check(label, condition) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passCount += 1;
  } else {
    console.error(`FAIL: ${label}`);
    failCount += 1;
  }
}

async function timed(label, fn) {
  const start = performance.now();
  const result = await fn();
  const ms = Math.round(performance.now() - start);
  timings.push({ label, ms });
  console.log(`TIMING: ${label} = ${ms}ms`);
  return result;
}

async function req(method, url, accessToken, body, extraHeaders = {}) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...extraHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  const text = await res.text();
  let parsed = {};
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { status: res.status, headers: res.headers, body: parsed };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * MVP Hardening full user-journey scenario (post-Phase 13) - real,
 * end-to-end, timed. Not a phase - a cross-cutting readiness check before
 * Phase 14. See docs/reviews/mvp-hardening-report.md for the full report
 * this script's output feeds into.
 */
async function main() {
  // 1. Register
  const registerRes = await timed("Register", () =>
    fetch(`${BASE}/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Hardening Bot" }),
    }),
  );
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  let accessToken = registerBody.accessToken;

  // 2. Login (separately, not the register response)
  const loginRes = await timed("Login", () =>
    fetch(`${BASE}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const loginBody = await loginRes.json();
  check("login returns 200", loginRes.status === 200);
  accessToken = loginBody.accessToken;
  // Node's fetch has no built-in cookie jar (unlike a browser) - the
  // httpOnly refresh cookie from login has to be captured and replayed
  // manually for logout/refresh to see the real session, or this script
  // would be testing "no cookie sent" instead of real session behavior.
  const setCookieHeader = loginRes.headers.get("set-cookie") ?? "";
  const sessionCookie = setCookieHeader.split(";")[0];

  // 3. Workspace exists (created implicitly at register)
  const me = await getJson(`${BASE}/v1/users/me`, accessToken);
  check("GET /v1/users/me returns a workspace", me.body.workspaces?.length === 1);

  // 4. "Connect a connector" - Mock Connector send stands in for a real connector's first message (Telegram/Discord/Slack/Email all funnel through the identical event pipeline this exercises).
  const firstMessage = await timed("First message (connector -> ingestion)", async () => {
    await fetch(`${BASE}/dev/mock-connector/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ senderDisplayName: "Priya Vendor", senderExternalId: "priya-hardening", bodyText: "Hi, this is broken and not working, I need help urgently." }),
    });
    // Poll until it's visible in the inbox, rather than a fixed sleep - a more honest "time to visible" measurement.
    for (let i = 0; i < 20; i++) {
      const convos = await getJson(`${BASE}/v1/conversations`, accessToken);
      if (convos.body.data.some((c) => c.lastMessage?.sender?.displayName === "Priya Vendor")) return convos.body.data;
      await sleep(150);
    }
    return [];
  });
  check("the first message becomes visible in the inbox", firstMessage.some((c) => c.lastMessage?.sender?.displayName === "Priya Vendor"));
  const conversationId = firstMessage.find((c) => c.lastMessage?.sender?.displayName === "Priya Vendor")?.id;

  // 5. Inbox read path
  const inboxList = await timed("Inbox list (GET /v1/conversations)", () => getJson(`${BASE}/v1/conversations`, accessToken));
  check("inbox list returns 200", inboxList.status === 200);

  // 6. Search
  const searchResult = await timed("Search (GET /v1/search)", () => getJson(`${BASE}/v1/search?q=broken`, accessToken));
  check("search finds the message", searchResult.body.messages?.data?.some((m) => m.bodyText.includes("broken")));

  // 7. Automation rule creation + trigger
  const ruleCreate = await timed("Rule creation (POST /v1/rules)", () =>
    req("POST", `${BASE}/v1/rules`, accessToken, {
      name: "Hardening: tag urgent",
      trigger: { type: "message.received" },
      conditions: { field: "message.bodyText", operator: "contains", value: "urgent" },
      actions: [{ type: "tag.apply", params: { tag: "Urgent" } }],
    }),
  );
  check("rule creation returns 201", ruleCreate.status === 201);
  const ruleId = ruleCreate.body.id;

  const ruleTriggerStart = performance.now();
  let ruleExecuted = false;
  await fetch(`${BASE}/dev/mock-connector/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ senderDisplayName: "Priya Vendor", senderExternalId: "priya-hardening", bodyText: "Another urgent message." }),
  });
  for (let i = 0; i < 20; i++) {
    const executions = await getJson(`${BASE}/v1/rules/${ruleId}/executions`, accessToken);
    if (executions.body.data.length > 0) { ruleExecuted = true; break; }
    await sleep(150);
  }
  const ruleMs = Math.round(performance.now() - ruleTriggerStart);
  timings.push({ label: "Rule execution (message -> tag applied)", ms: ruleMs });
  console.log(`TIMING: Rule execution (message -> tag applied) = ${ruleMs}ms`);
  check("the automation rule executes and is observable", ruleExecuted);

  // 8. AI enrichment (ai.classification consumed by a rule)
  const aiRule = await req("POST", `${BASE}/v1/rules`, accessToken, {
    name: "Hardening: ai classification",
    trigger: { type: "message.received" },
    conditions: { field: "ai.classification", operator: "equals", value: "support" },
    actions: [{ type: "notification.send", params: { title: "Support message", body: "{{message.bodyText}}" } }],
  });
  const aiRuleId = aiRule.body.id;
  const aiStart = performance.now();
  let aiExecuted = false;
  await fetch(`${BASE}/dev/mock-connector/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ senderDisplayName: "Priya Vendor", senderExternalId: "priya-hardening", bodyText: "This is broken and not working, I need help with an error." }),
  });
  for (let i = 0; i < 20; i++) {
    const executions = await getJson(`${BASE}/v1/rules/${aiRuleId}/executions`, accessToken);
    if (executions.body.data.length > 0) { aiExecuted = true; break; }
    await sleep(150);
  }
  const aiMs = Math.round(performance.now() - aiStart);
  timings.push({ label: "AI enrichment (message -> ai.classification-conditioned rule fires)", ms: aiMs });
  console.log(`TIMING: AI enrichment = ${aiMs}ms`);
  check("ai.classification enrichment is observable end-to-end", aiExecuted);

  // 9. Notification
  const notifications = await getJson(`${BASE}/v1/notifications`, accessToken);
  check("notifications include at least one entry by now", notifications.body.data.length > 0);

  // 10. Logout - must present the real session cookie for the server to know which session to revoke.
  const logoutRes = await timed("Logout", () =>
    fetch(`${BASE}/v1/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, Cookie: sessionCookie } }),
  );
  check("logout returns 200/204", [200, 204].includes(logoutRes.status));

  // 11. A stale access token still decodes fine until natural expiry (access tokens are stateless JWTs) but the underlying session is revoked - verify refresh now fails.
  const refreshAfterLogout = await fetch(`${BASE}/v1/auth/refresh`, { method: "POST", headers: { Cookie: sessionCookie } });
  check("refreshing after logout fails (session revoked)", !refreshAfterLogout.ok);

  // 12. Login again
  const reLoginRes = await timed("Re-login", () =>
    fetch(`${BASE}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  check("re-login succeeds after logout", reLoginRes.status === 200);
  void conversationId;

  console.log("\n--- Timing table ---");
  console.table(timings);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

async function getJson(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
