import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `phase11-${randomBytes(6).toString("hex")}@example.com`;
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

async function getJson(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  return res.json();
}

async function req(method, url, accessToken, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
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

/** "HH:mm" a given number of minutes from now, in UTC (the dev workspace's default timezone) - used to build a silent-hours window guaranteed to be active right now. */
function nowPlusMinutesUTC(offsetMinutes) {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * Notification Engine regression (docs/ROADMAP.md Phase 11): the
 * NotificationPreference CRUD surface, and the real silent-hours/VIP-
 * override/keyword-alert evaluation wired into the starter rule's
 * conditions (a window covering "now" is configured, then a plain message
 * is confirmed suppressed, a VIP sender's message confirmed to break
 * through, and a keyword-matching message confirmed to break through too).
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Phase 11 Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  // 1. Defaults before any preference row exists.
  const defaults = await getJson(`${BASE}/v1/notification-preferences`, accessToken);
  check("a fresh workspace has no silent hours configured by default", defaults.silentHoursStart === null && defaults.silentHoursEnd === null);
  check("VIP override defaults to enabled", defaults.vipOverrideEnabled === true);

  // 2. With no silent hours configured, a plain message still notifies (no regression vs. Phase 10's unconditional starter rule).
  await sendMock(accessToken, { senderDisplayName: "Jordan Plain", senderExternalId: "jordan-plain", bodyText: "Just saying hi." });
  await sleep(600);
  let notifications = await getJson(`${BASE}/v1/notifications`, accessToken);
  check("a plain message notifies when no silent hours are configured", notifications.some((n) => n.title.includes("Jordan Plain")));

  // 3. Configure a silent-hours window covering right now (UTC, the dev workspace's default timezone).
  const silentHoursStart = nowPlusMinutesUTC(-30);
  const silentHoursEnd = nowPlusMinutesUTC(30);
  const patchRes = await req("PATCH", `${BASE}/v1/notification-preferences`, accessToken, {
    silentHoursStart,
    silentHoursEnd,
    vipOverrideEnabled: true,
    keywordAlerts: ["urgent"],
  });
  check("PATCH /v1/notification-preferences succeeds", patchRes.status === 200);
  check("the saved preference round-trips keywordAlerts", patchRes.body.keywordAlerts.includes("urgent"));

  const getAfterPatch = await getJson(`${BASE}/v1/notification-preferences`, accessToken);
  check("GET reflects the saved silent-hours window", getAfterPatch.silentHoursStart === silentHoursStart && getAfterPatch.silentHoursEnd === silentHoursEnd);

  // 4. During silent hours, a plain non-VIP, non-keyword message does NOT notify.
  await sendMock(accessToken, { senderDisplayName: "Casey Quiet", senderExternalId: "casey-quiet", bodyText: "Nothing important." });
  await sleep(600);
  notifications = await getJson(`${BASE}/v1/notifications`, accessToken);
  check("a plain message during silent hours does not notify", !notifications.some((n) => n.title.includes("Casey Quiet")));

  // 5. A VIP sender's message DOES notify during silent hours (VIP override).
  await sendMock(accessToken, { senderDisplayName: "Priya VIP", senderExternalId: "priya-vip-11", bodyText: "First message." });
  await sleep(400);
  const contacts = await getJson(`${BASE}/v1/contacts`, accessToken);
  const priya = contacts.find((c) => c.displayName === "Priya VIP");
  check("Priya VIP contact exists", Boolean(priya));
  if (priya) await req("PATCH", `${BASE}/v1/contacts/${priya.id}`, accessToken, { isVip: true });

  await sendMock(accessToken, { senderDisplayName: "Priya VIP", senderExternalId: "priya-vip-11", bodyText: "Second message, now VIP." });
  await sleep(600);
  notifications = await getJson(`${BASE}/v1/notifications`, accessToken);
  check("a VIP sender's message notifies during silent hours (VIP override)", notifications.some((n) => n.title.includes("Priya VIP")));

  // 6. A keyword-matching message DOES notify during silent hours, even from a non-VIP sender.
  await sendMock(accessToken, { senderDisplayName: "Alex Keyword", senderExternalId: "alex-keyword", bodyText: "This is urgent, please call me." });
  await sleep(600);
  notifications = await getJson(`${BASE}/v1/notifications`, accessToken);
  check("a keyword-matching message notifies during silent hours", notifications.some((n) => n.title.includes("Alex Keyword")));

  // 7. Disabling VIP override means even a VIP sender stays silent.
  await req("PATCH", `${BASE}/v1/notification-preferences`, accessToken, { vipOverrideEnabled: false });
  await sendMock(accessToken, { senderDisplayName: "Priya VIP", senderExternalId: "priya-vip-11", bodyText: "Third message, override disabled." });
  await sleep(600);
  const notificationsAfterDisable = await getJson(`${BASE}/v1/notifications`, accessToken);
  const priyaNotificationCount = notificationsAfterDisable.filter((n) => n.title.includes("Priya VIP")).length;
  check("disabling VIP override means a VIP sender no longer breaks through silent hours", priyaNotificationCount === 1);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
