import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const WEB_BASE = process.env.SMC_WEB_URL ?? "http://localhost:3000";
const email = `phase14-${randomBytes(6).toString("hex")}@example.com`;
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

async function sendMock(accessToken, { senderDisplayName, senderExternalId, bodyText }) {
  const res = await fetch(`${BASE}/dev/mock-connector/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ senderDisplayName, senderExternalId, bodyText }),
  });
  return res.json();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * PWA regression (docs/ROADMAP.md Phase 14) - real, end-to-end checks for
 * everything an HTTP script can actually exercise: the manifest, the
 * generated icons, the service worker file being served, and the full
 * Web Push subscribe -> a rule's notification.send delivers (or at least
 * never breaks the action) -> unsubscribe lifecycle. Client-only behavior
 * (service worker registration itself, the install prompt, IndexedDB
 * background-sync queuing) cannot be exercised without a real browser -
 * disclosed in docs/reviews/phase-14-review.md, not silently skipped.
 */
async function main() {
  // 1. Manifest.
  const manifestRes = await fetch(`${WEB_BASE}/manifest.webmanifest`);
  const manifestBody = await manifestRes.json().catch(() => ({}));
  check("manifest.webmanifest is served", manifestRes.status === 200);
  check("manifest has display: standalone (installable)", manifestBody.display === "standalone");
  check("manifest declares at least a 192 and 512 icon", (manifestBody.icons ?? []).some((i) => i.sizes === "192x192") && (manifestBody.icons ?? []).some((i) => i.sizes === "512x512"));

  // 2. Generated icons are real images, not 404s.
  const icon192 = await fetch(`${WEB_BASE}/icon-192`);
  check("icon-192 is served as a PNG", icon192.status === 200 && (icon192.headers.get("content-type") ?? "").includes("image/png"));
  const icon512 = await fetch(`${WEB_BASE}/icon-512`);
  check("icon-512 is served as a PNG", icon512.status === 200 && (icon512.headers.get("content-type") ?? "").includes("image/png"));

  // 3. Service worker is served (a real file, not the SPA fallback HTML).
  const swRes = await fetch(`${WEB_BASE}/sw.js`);
  const swBody = await swRes.text();
  check("sw.js is served", swRes.status === 200);
  check("sw.js is real JS content, not an HTML fallback page", swBody.includes("addEventListener") && !swBody.trim().startsWith("<!DOCTYPE"));

  // 4. Web Push subscription lifecycle.
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Phase 14 Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  const fakeEndpoint = `https://fcm.googleapis.com/fcm/send/verify-phase14-${randomBytes(8).toString("hex")}`;
  const subscribeRes = await req("POST", `${BASE}/v1/push-subscriptions`, accessToken, {
    endpoint: fakeEndpoint,
    keys: { p256dh: "fake-p256dh-key-for-verification", auth: "fake-auth-secret" },
  });
  check("subscribing to push succeeds", subscribeRes.status === 201);

  const missingFields = await req("POST", `${BASE}/v1/push-subscriptions`, accessToken, { endpoint: fakeEndpoint });
  check("subscribing without keys is rejected (400)", missingFields.status === 400);

  // 5. A rule's notification.send action still succeeds even though the
  // subscribed endpoint is fake and push delivery to it will fail - proving
  // push delivery failures never break the underlying automation action
  // (PRODUCT.md's "never load-bearing" principle, extended to Phase 14).
  const rule = await req("POST", `${BASE}/v1/rules`, accessToken, {
    name: "Push delivery does not block notification.send",
    trigger: { type: "message.received" },
    conditions: { op: "AND", children: [] },
    actions: [{ type: "notification.send", params: { title: "Test", body: "{{message.bodyText}}" } }],
  });
  const ruleId = rule.body.id;
  await sendMock(accessToken, { senderDisplayName: "Push Test", senderExternalId: "push-test", bodyText: "Hello" });
  await sleep(700);
  const executions = await req("GET", `${BASE}/v1/rules/${ruleId}/executions`, accessToken);
  check("the rule still executes successfully despite an undeliverable push subscription", executions.body.length > 0 && executions.body[0].status === "success");

  // 6. Unsubscribe.
  const unsubscribeRes = await req("DELETE", `${BASE}/v1/push-subscriptions`, accessToken, { endpoint: fakeEndpoint });
  check("unsubscribing succeeds", unsubscribeRes.status === 200);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
