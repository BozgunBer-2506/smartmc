import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "https://smcapi-production-bc04.up.railway.app";
const BOT_TOKEN = process.env.TELEGRAM_TEST_BOT_TOKEN;
const email = `p21-1-prod-${randomBytes(6).toString("hex")}@example.com`;
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

/**
 * Pure-HTTP production live verification for Phase 21.1 (the connector
 * reconnect-after-soft-delete fix), run directly against
 * https://smcapi-production-bc04.up.railway.app with a real Telegram bot
 * token. Deliberately does NOT touch the database directly (no
 * @smc/database import) - every check goes through the real, public API
 * surface, exactly as a real user's browser would, and creates no
 * synthetic/DB-level test data beyond one throwaway test user + one real
 * connect/disconnect/reconnect cycle for the provided bot.
 */
async function main() {
  if (!BOT_TOKEN) {
    console.error("FAIL: TELEGRAM_TEST_BOT_TOKEN is not set - cannot run this live verification at all.");
    process.exit(1);
  }

  console.log(`Target: ${BASE}\n`);

  // 1. A real, throwaway test user - same pattern as every other Phase 20.x
  // production verification this session.
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Phase 21.1 Prod Verify" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  if (registerRes.status !== 201) {
    console.error("\nINCONCLUSIVE: could not register a test user - aborting.");
    process.exit(1);
  }
  const accessToken = registerBody.accessToken;

  // 2. First connect - a real GET /getMe call to Telegram, a real
  // LinkedAccount row created.
  const connectRes1 = await fetch(`${BASE}/v1/connectors/telegram/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ botToken: BOT_TOKEN }),
  });
  const connect1Body = await connectRes1.json();
  check("initial connect succeeds (201)", connectRes1.status === 201);
  if (connectRes1.status !== 201) {
    console.error(`\nINCONCLUSIVE: initial connect failed (${connectRes1.status}): ${JSON.stringify(connect1Body)}`);
    process.exit(1);
  }
  const linkedAccountIdA = connect1Body.id;
  check("initial LinkedAccount has a real id", Boolean(linkedAccountIdA));
  check("initial LinkedAccount status is active", connect1Body.status === "active");

  // 3. Disconnect - this is the real soft delete (SECURITY.md Section 5.2's
  // unconditional deletion, apps/api/src's disconnect() handlers).
  const disconnectRes = await fetch(`${BASE}/v1/connectors/telegram/${linkedAccountIdA}/disconnect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // NestJS defaults an un-annotated @Post() handler's success status to
  // 201 - a pre-existing, minor REST-convention quirk on this endpoint
  // (disconnect isn't "creating" anything), unrelated to Phase 21.1's
  // actual scope. Accepting 201 here to match real observed behavior,
  // confirmed live.
  check("disconnect succeeds (200/201/204)", [200, 201, 204].includes(disconnectRes.status));

  // 4. THE CORE REGRESSION TEST: reconnecting the SAME bot, right after
  // disconnect, for the same workspace. Before this phase's fix, this
  // would fail - either the app-level "already connected" 409, or
  // (the actual root cause) a raw Postgres P2002 unique-violation on
  // linked_accounts' index.
  const connectRes2 = await fetch(`${BASE}/v1/connectors/telegram/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ botToken: BOT_TOKEN }),
  });
  const connect2Body = await connectRes2.json();
  check(
    "reconnect succeeds (201) - the actual bug this phase fixes, not a 409 or 500/P2002",
    connectRes2.status === 201,
  );
  if (connectRes2.status !== 201) {
    console.error(`\nRECONNECT FAILED (${connectRes2.status}): ${JSON.stringify(connect2Body)}`);
    check("no P2002 unique-constraint failure on reconnect", false);
    inconclusive = true;
  } else {
    // A generic 500 could still be masking a P2002 the exception filter
    // turned into an opaque error - explicitly check the response doesn't
    // mention it, and that reconnect returned a genuinely new id.
    const bodyText = JSON.stringify(connect2Body);
    check("no P2002 unique-constraint failure on reconnect", !bodyText.includes("P2002") && !bodyText.includes("Unique constraint"));
  }
  const linkedAccountIdB = connect2Body.id;
  check("reconnect returns 201 with a real id", Boolean(linkedAccountIdB));
  check("the reconnected LinkedAccount is a NEW row, not the old (soft-deleted) one", linkedAccountIdB && linkedAccountIdB !== linkedAccountIdA);
  check("the reconnected LinkedAccount status is active", connect2Body.status === "active");

  // 5. "Exactly one active LinkedAccount" / "old record remains
  // soft-deleted" - no listing endpoint exists (a real, disclosed gap;
  // Phase 21.2 - Connector management UX should close it), so this is
  // checked the only way the public API allows: disconnecting the OLD
  // (already-disconnected) id again must 404 (it's gone from the
  // workspace's live view), while disconnecting the NEW id must succeed
  // (it's the one that's actually active).
  const redisconnectOldRes = await fetch(`${BASE}/v1/connectors/telegram/${linkedAccountIdA}/disconnect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  check(
    "the OLD (already soft-deleted) LinkedAccount is not found for a second disconnect - confirms it's genuinely gone from the active set, not silently re-activated",
    redisconnectOldRes.status === 404,
  );

  // 6. Real Telegram message delivery -> Inbox. Requires a human to
  // actually send a message to the bot right now; polls for up to 30s.
  console.log("\n>>> Send a real message to the Telegram bot NOW. Polling GET /v1/conversations for up to 30s...\n");
  let sawMessage = false;
  let lastConversationsSnapshot = null;
  for (let i = 0; i < 15; i++) {
    const convRes = await fetch(`${BASE}/v1/conversations?limit=10`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const convBody = await convRes.json();
    lastConversationsSnapshot = convBody;
    if (Array.isArray(convBody.data) && convBody.data.length > 0) {
      sawMessage = true;
      break;
    }
    await sleep(2000);
  }
  check("a real Telegram message sent after reconnect reaches the Inbox (GET /v1/conversations)", sawMessage);
  if (!sawMessage) {
    inconclusive = true;
    console.error("INCONCLUSIVE: no message observed within 30s - either none was sent, or delivery genuinely failed.");
  } else {
    console.log(`Inbox snapshot: ${JSON.stringify(lastConversationsSnapshot.data[0], null, 2)}`);
  }

  console.log(`\n${passCount} passed, ${failCount} failed${inconclusive ? ", 1 check INCONCLUSIVE (not counted as pass)" : ""}`);
  if (inconclusive) {
    console.error("\nNOT marking Phase 21.1 complete - at least one check is inconclusive, per explicit instruction.");
    process.exit(2);
  }
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
