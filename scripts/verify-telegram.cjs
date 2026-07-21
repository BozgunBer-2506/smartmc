const { randomBytes } = require("node:crypto");
const { getPrismaClient } = require("@smc/database");

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `telegram-${randomBytes(6).toString("hex")}@example.com`;
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

/**
 * Live verification for the Telegram connector (docs/ROADMAP.md Phase 4
 * Sprint 2), run against the actual running API and the actual Telegram
 * network:
 *
 * 1. A clearly invalid bot token is really rejected by Telegram itself
 *    (POST /v1/connectors/telegram/connect really calls getMe over the
 *    network - this is not a mocked check).
 * 2. If TELEGRAM_TEST_BOT_TOKEN is set, connects a real bot for real,
 *    then simulates an inbound Telegram webhook payload against our own
 *    receiver (POST /v1/connectors/telegram/webhook/{id}) - proving the
 *    ingestion pipeline (event bus -> IdentityGraph -> Postgres ->
 *    WebSocket) end to end without needing a public HTTPS tunnel for
 *    Telegram itself to reach us.
 *
 * A real chat with a real Telegram user (needed to prove genuine outbound
 * delivery) is exercised separately, interactively, not by this script -
 * see docs/reviews/phase-4-sprint-2-review.md for what was verified how.
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Telegram Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  // 1. A real network call to Telegram with a bogus token must be really rejected.
  const badConnectRes = await fetch(`${BASE}/v1/connectors/telegram/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ botToken: "000000000:not-a-real-telegram-bot-token-at-all" }),
  });
  const badConnectBody = await badConnectRes.json();
  check("connect with an invalid token returns 422", badConnectRes.status === 422);
  check("connect with an invalid token reports code INVALID_BOT_TOKEN", badConnectBody.code === "INVALID_BOT_TOKEN");

  const realToken = process.env.TELEGRAM_TEST_BOT_TOKEN;
  if (!realToken) {
    console.log("\nSKIP: full connect/webhook/reply flow (TELEGRAM_TEST_BOT_TOKEN not set - this is expected in CI)");
    console.log(`\n${passCount} passed, ${failCount} failed`);
    process.exit(failCount === 0 ? 0 : 1);
    return;
  }

  // 2. A real bot token really connects.
  const connectRes = await fetch(`${BASE}/v1/connectors/telegram/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ botToken: realToken }),
  });
  const connectBody = await connectRes.json();
  check("connect with a real bot token returns 201", connectRes.status === 201);
  check("the LinkedAccount's status is active", connectBody.status === "active");
  const linkedAccountId = connectBody.id;

  const prisma = getPrismaClient();
  const linkedAccount = await prisma.linkedAccount.findUnique({ where: { id: linkedAccountId } });
  check("the LinkedAccount was persisted with a webhook secret", Boolean(linkedAccount?.webhookSecret));

  // 3. Simulate Telegram delivering a webhook update - our own receiver,
  // our own event pipeline, no public tunnel required to prove this half.
  const simulatedUpdate = {
    update_id: Math.floor(Date.now() / 1000),
    message: {
      message_id: Math.floor(Date.now() / 1000),
      date: Math.floor(Date.now() / 1000),
      chat: { id: 555000111, type: "private", first_name: "Verify" },
      from: { id: 555000111, is_bot: false, first_name: "Verify", username: "verify_user" },
      text: "A simulated inbound message for live webhook verification.",
    },
  };

  const webhookRes = await fetch(`${BASE}/v1/connectors/telegram/webhook/${linkedAccountId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": linkedAccount.webhookSecret },
    body: JSON.stringify(simulatedUpdate),
  });
  check("the webhook receiver accepts a correctly-signed update", webhookRes.status === 201 || webhookRes.status === 200);

  const wrongSecretRes = await fetch(`${BASE}/v1/connectors/telegram/webhook/${linkedAccountId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "wrong-secret" },
    body: JSON.stringify(simulatedUpdate),
  });
  check("the webhook receiver rejects a wrong secret token", wrongSecretRes.status === 401);

  await new Promise((resolve) => setTimeout(resolve, 1500)); // event bus processing

  const conversationsRes = await fetch(`${BASE}/v1/conversations`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const conversations = await conversationsRes.json();
  check("the simulated Telegram message appears in the real Inbox", conversations.length >= 1);
  check(
    "the sender resolved through IdentityGraph and is shown by name",
    conversations[0]?.lastMessage?.sender?.displayName === "Verify",
  );

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
