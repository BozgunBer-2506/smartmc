import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `p21-3-${randomBytes(6).toString("hex")}@example.com`;
const password = `Vf9${randomBytes(12).toString("hex")}Zq`;

let passCount = 0;
let failCount = 0;
let inconclusive = false;

function check(label, condition) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passCount += 1;
  } else {
    console.error(`FAIL: ${label}`);
    failCount += 1;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function register(displayName) {
  const suffix = randomBytes(4).toString("hex");
  const res = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `p21-3-${suffix}@example.com`, password, displayName }),
  });
  const body = await res.json();
  return { status: res.status, accessToken: body.accessToken };
}

/**
 * Live verification for Phase 21.6 (docs/ROADMAP.md) - user-initiated
 * scheduled message send. Covers the mechanics a mock (no real
 * LinkedAccount) conversation can exercise end to end: schedule
 * creation/validation, listing, cancellation, workspace isolation. The
 * actual delivery-at-the-scheduled-time step (ScheduledMessageService.fire
 * -> MessageSendService.send) requires a real connected account and is
 * gated behind TELEGRAM_TEST_BOT_TOKEN + an existing conversation with that
 * bot, same pattern as scripts/verify-phase21.1-production-live.mjs -
 * skipped, not assumed passing, when that's not set.
 */
async function main() {
  const { status: registerStatus, accessToken } = await register("Phase 21.6 Verify Bot");
  check("register returns 201", registerStatus === 201);

  // 1. Auth is required on both endpoints.
  const unauthListRes = await fetch(`${BASE}/v1/scheduled-messages`);
  check("GET /v1/scheduled-messages without a token returns 401", unauthListRes.status === 401);

  // 2. A fresh workspace has no scheduled messages.
  const emptyListRes = await fetch(`${BASE}/v1/scheduled-messages`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const emptyListBody = await emptyListRes.json();
  check("GET /v1/scheduled-messages returns 200 for a fresh workspace", emptyListRes.status === 200);
  check("a fresh workspace has an empty scheduled-message list", Array.isArray(emptyListBody.data) && emptyListBody.data.length === 0);

  // 3. Create a mock conversation to schedule against (dev-only endpoint - see MockConnectorController).
  const mockRes = await fetch(`${BASE}/dev/mock-connector/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ senderDisplayName: "Phase 21.6 Test Contact", bodyText: "hi" }),
  });
  if (mockRes.status !== 201 && mockRes.status !== 200) {
    console.error(`\nINCONCLUSIVE: could not seed a mock conversation (${mockRes.status}) - is NODE_ENV=production? Aborting.`);
    process.exit(1);
  }
  await sleep(500); // let ingestion (IdentityGraph resolution, Conversation create) settle.
  const convRes = await fetch(`${BASE}/v1/conversations?limit=5`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const convBody = await convRes.json();
  const conversationId = convBody.data?.[0]?.id;
  check("a mock conversation exists to schedule against", Boolean(conversationId));
  if (!conversationId) {
    console.error("\nINCONCLUSIVE: no conversation to test against - aborting remaining checks.");
    process.exit(1);
  }

  // 4. A missing body is rejected even with sendAt present.
  const futureSendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const noBodyRes = await fetch(`${BASE}/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ sendAt: futureSendAt }),
  });
  check("scheduling with no body is rejected (400)", noBodyRes.status === 400);

  // 5. An invalid sendAt is rejected.
  const badSendAtRes = await fetch(`${BASE}/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ body: "hello", sendAt: "not-a-date" }),
  });
  check("an unparseable sendAt is rejected (400)", badSendAtRes.status === 400);

  // 6. A future sendAt creates a durable, pending ScheduledMessage and returns 202, not 201.
  const scheduleRes = await fetch(`${BASE}/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ body: "Scheduled reply for later", sendAt: futureSendAt }),
  });
  const scheduleBody = await scheduleRes.json();
  check("a future sendAt returns 202 Accepted", scheduleRes.status === 202);
  check("the response reports status=pending", scheduleBody.status === "pending");
  check("the response echoes the body text", scheduleBody.bodyText === "Scheduled reply for later");
  const scheduledId = scheduleBody.id;

  const listAfterScheduleRes = await fetch(`${BASE}/v1/scheduled-messages`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const listAfterScheduleBody = await listAfterScheduleRes.json();
  check("the scheduled message now appears in GET /v1/scheduled-messages", listAfterScheduleBody.data.some((s) => s.id === scheduledId));

  // 7. A sendAt in the past is NOT scheduled - it falls through to the immediate
  // send path, which fails for a mock conversation (no LinkedAccount) exactly
  // as a plain immediate send always has (pre-existing, disclosed behavior) -
  // this confirms the branch, not a regression.
  const pastSendAt = new Date(Date.now() - 60 * 1000).toISOString();
  const pastSendRes = await fetch(`${BASE}/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ body: "should send immediately, not schedule", sendAt: pastSendAt }),
  });
  check(
    "a past sendAt is treated as an immediate send, not scheduled (fails on a mock conversation exactly like a plain immediate send)",
    pastSendRes.status === 422,
  );

  // 8. Cancel the pending scheduled message.
  const cancelRes = await fetch(`${BASE}/v1/scheduled-messages/${scheduledId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const cancelBody = await cancelRes.json();
  // NestJS defaults an un-annotated @Post() handler's success status to 201
  // (same pre-existing quirk noted in verify-phase21.1-production-live.mjs) -
  // accepting 200/201 to match real observed behavior, not a bug in this endpoint.
  check("cancelling a pending scheduled message succeeds (200/201)", [200, 201].includes(cancelRes.status));
  check("the cancelled message reports status=cancelled", cancelBody.status === "cancelled");

  // 9. Cancelling again (already cancelled) is a 404, not a silent no-op success.
  const doubleCancelRes = await fetch(`${BASE}/v1/scheduled-messages/${scheduledId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  check("cancelling an already-cancelled scheduled message returns 404", doubleCancelRes.status === 404);

  // 10. Cancelling a non-existent id is a 404.
  const missingCancelRes = await fetch(`${BASE}/v1/scheduled-messages/00000000-0000-0000-0000-000000000000/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  check("cancelling a non-existent scheduled message id returns 404", missingCancelRes.status === 404);

  // 11. Workspace isolation: a second, unrelated user cannot see or cancel the first user's scheduled message.
  const secondSchedule = await fetch(`${BASE}/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ body: "isolation test", sendAt: futureSendAt }),
  });
  const secondScheduleBody = await secondSchedule.json();
  const { accessToken: otherAccessToken } = await register("Phase 21.6 Verify Bot 2");
  const otherListRes = await fetch(`${BASE}/v1/scheduled-messages`, { headers: { Authorization: `Bearer ${otherAccessToken}` } });
  const otherListBody = await otherListRes.json();
  check("a second, unrelated workspace does not see the first workspace's scheduled message", otherListBody.data.length === 0);
  const otherCancelRes = await fetch(`${BASE}/v1/scheduled-messages/${secondScheduleBody.id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${otherAccessToken}` },
  });
  check("a second, unrelated workspace cannot cancel the first workspace's scheduled message (404)", otherCancelRes.status === 404);
  // Clean up.
  await fetch(`${BASE}/v1/scheduled-messages/${secondScheduleBody.id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // 12. Real end-to-end delivery: requires TELEGRAM_TEST_BOT_TOKEN and a real
  // Telegram-linked conversation, and (per the model this feature exists
  // for) actually firing at the scheduled time - not attempted here without
  // both, and not counted as a pass if skipped.
  const botToken = process.env.TELEGRAM_TEST_BOT_TOKEN;
  if (!botToken) {
    console.log("\nSKIP: real scheduled-send delivery to Telegram (TELEGRAM_TEST_BOT_TOKEN not set - this is expected outside a manual production check).");
  } else {
    console.log("\nSKIP: real scheduled-send delivery to Telegram is not automated by this script even with a token set");
    console.log("- it requires an existing Telegram-linked conversation and a human sending a message first (see scripts/verify-phase21.1-production-live.mjs's pattern), plus waiting past the scheduled time. Run that check manually.");
  }

  console.log(`\n${passCount} passed, ${failCount} failed${inconclusive ? ", 1+ check INCONCLUSIVE (not counted as pass)" : ""}`);
  if (inconclusive) {
    process.exit(2);
  }
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
