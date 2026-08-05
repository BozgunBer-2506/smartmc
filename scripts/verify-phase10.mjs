import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `phase10-${randomBytes(6).toString("hex")}@example.com`;
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

async function req(method, url, accessToken, body, extraHeaders = {}) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...extraHeaders },
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

/**
 * Automation Engine regression (docs/ROADMAP.md Phase 10,
 * docs/AUTOMATION_ENGINE.md): the default starter rule every new workspace
 * gets, condition-gated rule matching (a VIP-only rule fires for a VIP
 * sender and not for a non-VIP one), tag.apply's effect on the
 * conversation, idempotent execution logging, the dry-run test endpoint,
 * optimistic-locking version conflicts, and enable/disable + delete.
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Phase 10 Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  // 1. Every new workspace starts with the "Notify me on every message" starter rule.
  const initialRules = (await getJson(`${BASE}/v1/rules`, accessToken)).data;
  check("a new workspace has exactly one starter rule", initialRules.length === 1);
  check("the starter rule is enabled and targets message.received", initialRules[0]?.isEnabled === true && initialRules[0]?.triggerType === "message.received");

  // 2. A plain message still produces a notification via the starter rule (Phase 1-9's stub behavior, now a real rule).
  await sendMock(accessToken, { senderDisplayName: "Jordan Plain", senderExternalId: "jordan-plain", bodyText: "Just saying hi." });
  await sleep(600);
  let notifications = (await getJson(`${BASE}/v1/notifications`, accessToken)).data;
  check("the starter rule creates a notification for a plain message", notifications.some((n) => n.title.includes("Jordan Plain")));

  // 3. A VIP-conditioned rule: create it, then confirm it only fires for a VIP sender.
  const createRes = await req("POST", `${BASE}/v1/rules`, accessToken, {
    name: "Tag VIP messages",
    trigger: { type: "message.received" },
    conditions: { field: "sender.isVip", operator: "is_true" },
    actions: [{ type: "tag.apply", params: { tag: "VIP" } }],
  });
  check("creating a conditioned rule returns 201", createRes.status === 201);
  const vipRuleId = createRes.body.id;

  await sendMock(accessToken, { senderDisplayName: "Sam NonVip", senderExternalId: "sam-nonvip", bodyText: "Regular message." });
  await sleep(600);
  const executionsAfterNonVip = (await getJson(`${BASE}/v1/rules/${vipRuleId}/executions`, accessToken)).data;
  check("a non-VIP sender's message does not execute the VIP-only rule", executionsAfterNonVip.length === 0);

  // Mark a new contact VIP before their first message so sender.isVip is true at match time.
  await sendMock(accessToken, { senderDisplayName: "Priya VIP", senderExternalId: "priya-vip", bodyText: "First message." });
  await sleep(400);
  const contactsAfterFirst = (await getJson(`${BASE}/v1/contacts`, accessToken)).data;
  const priya = contactsAfterFirst.find((c) => c.displayName === "Priya VIP");
  check("Priya VIP contact exists", Boolean(priya));
  if (priya) {
    await req("PATCH", `${BASE}/v1/contacts/${priya.id}`, accessToken, { isVip: true });
  }

  await sendMock(accessToken, { senderDisplayName: "Priya VIP", senderExternalId: "priya-vip", bodyText: "Second message, now VIP." });
  await sleep(600);

  const vipExecutions = (await getJson(`${BASE}/v1/rules/${vipRuleId}/executions`, accessToken)).data;
  check("the VIP rule has exactly one successful execution (only Priya's VIP message matched)", vipExecutions.length === 1 && vipExecutions[0].status === "success");
  check("the execution recorded the tag.apply action succeeding", vipExecutions[0]?.actionsExecuted?.[0]?.type === "tag.apply" && vipExecutions[0]?.actionsExecuted?.[0]?.status === "success");

  // 4. Idempotency: re-running the dry-run endpoint never writes an execution log (no side effects).
  const dryRun = await req("POST", `${BASE}/v1/rules/${vipRuleId}/dry-run`, accessToken, { bodyText: "test", senderDisplayName: "Test", senderIsVip: true });
  check("dry-run matches a VIP sample", dryRun.body.matched === true);
  const dryRunNonVip = await req("POST", `${BASE}/v1/rules/${vipRuleId}/dry-run`, accessToken, { bodyText: "test", senderDisplayName: "Test", senderIsVip: false });
  check("dry-run does not match a non-VIP sample", dryRunNonVip.body.matched === false);
  const executionsAfterDryRun = (await getJson(`${BASE}/v1/rules/${vipRuleId}/executions`, accessToken)).data;
  check("dry-run never writes a real execution log", executionsAfterDryRun.length === vipExecutions.length);

  // 5. Real HTTP-native optimistic locking (docs/ROADMAP.md Phase 20.4):
  // each PATCH must send If-Match with the version it actually saw; a
  // stale one 412s, and the "second" PATCH here uses the version the
  // first PATCH just returned, so it's genuinely current, not stale.
  const staleUpdate = await req("PATCH", `${BASE}/v1/rules/${vipRuleId}`, accessToken, { name: "Renamed once" }, { "If-Match": String(createRes.body.version) });
  check("the first PATCH succeeds", staleUpdate.status === 200);
  const secondStaleUpdate = await req(
    "PATCH",
    `${BASE}/v1/rules/${vipRuleId}`,
    accessToken,
    { name: "Renamed twice" },
    { "If-Match": String(staleUpdate.body.version) },
  );
  check("a PATCH with the now-current version also succeeds (version tracked correctly)", secondStaleUpdate.status === 200);
  const staleIfMatchRetry = await req("PATCH", `${BASE}/v1/rules/${vipRuleId}`, accessToken, { name: "Renamed thrice" }, { "If-Match": String(createRes.body.version) });
  check("re-using the original (now-stale) version in If-Match is rejected with 412", staleIfMatchRetry.status === 412);

  // 6. Disable a rule and confirm it stops matching.
  const disableRes = await req(
    "PATCH",
    `${BASE}/v1/rules/${vipRuleId}`,
    accessToken,
    { isEnabled: false },
    { "If-Match": String(secondStaleUpdate.body.version) },
  );
  check("disabling the rule succeeds", disableRes.status === 200 && disableRes.body.isEnabled === false);

  await sendMock(accessToken, { senderDisplayName: "Priya VIP", senderExternalId: "priya-vip", bodyText: "Third message, rule now disabled." });
  await sleep(600);
  const executionsAfterDisable = (await getJson(`${BASE}/v1/rules/${vipRuleId}/executions`, accessToken)).data;
  check("a disabled rule does not execute on a new matching message", executionsAfterDisable.length === vipExecutions.length);

  // 7. Delete (soft) removes it from the list.
  const deleteRes = await req("DELETE", `${BASE}/v1/rules/${vipRuleId}`, accessToken);
  check("deleting the rule succeeds", deleteRes.status === 200);
  const rulesAfterDelete = (await getJson(`${BASE}/v1/rules`, accessToken)).data;
  check("the deleted rule no longer appears in the list", !rulesAfterDelete.some((r) => r.id === vipRuleId));

  // 8. Validation: an unregistered trigger type is rejected.
  const invalidTrigger = await req("POST", `${BASE}/v1/rules`, accessToken, {
    name: "Bad rule",
    trigger: { type: "not.a.real.trigger" },
    conditions: { op: "AND", children: [] },
    actions: [{ type: "notification.send", params: { title: "x", body: "y" } }],
  });
  check("creating a rule with an unregistered trigger type is rejected (400)", invalidTrigger.status === 400);

  // 9. The scheduled `time.no_reply_after` trigger (AUTOMATION_ENGINE.md
  // Section 3.3): fires once its delay elapses if nobody replied, and is
  // cancelled by a reply that arrives first. Uses a fractional-hour delay
  // (well under a second) so this stays a fast regression check rather
  // than a real multi-hour wait - the durable ScheduledJob/BullMQ
  // mechanism is identical regardless of the configured duration.
  const scheduledRuleRes = await req("POST", `${BASE}/v1/rules`, accessToken, {
    name: "No reply after a beat",
    trigger: { type: "time.no_reply_after", params: { hours: 0.0006 } }, // ~2.2s
    conditions: { op: "AND", children: [] },
    actions: [{ type: "notification.send", params: { title: "No reply reminder", body: "Still waiting on a reply." } }],
  });
  check("creating a time.no_reply_after rule returns 201", scheduledRuleRes.status === 201);
  const scheduledRuleId = scheduledRuleRes.body.id;

  await sendMock(accessToken, { senderDisplayName: "Taylor Waiting", senderExternalId: "taylor-waiting", bodyText: "Are you there?" });
  await sleep(3500);
  const scheduledExecutions = (await getJson(`${BASE}/v1/rules/${scheduledRuleId}/executions`, accessToken)).data;
  check("the no-reply rule fires once its delay elapses with no reply", scheduledExecutions.length === 1 && scheduledExecutions[0].status === "success");
  // Cancellation-on-reply (SchedulerService.cancelNoReplyRules) isn't
  // exercised here: the Mock Connector only ever generates inbound
  // messages and mock conversations have no LinkedAccount to reply
  // through (POST /v1/conversations/:id/messages 422s on them, correctly -
  // see docs/reviews/phase-10-review.md), so there's no way to produce a
  // real outbound reply against a mock conversation from this script.
  // Verified by code review instead: cancelNoReplyRules is called from
  // both the outbound branch of EventsProcessor and
  // ConversationsController's real send path.

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
