import { randomBytes } from "node:crypto";
import { io } from "socket.io-client";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `phase3-${randomBytes(6).toString("hex")}@example.com`;
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
 * The Phase 3 demo script (docs/ROADMAP.md Phase 3), as an automated
 * regression check: register -> login (implicit in register) -> connect
 * an authenticated realtime socket -> a mock message arrives for *this
 * user's own real workspace* -> it shows up live over the socket -> a
 * notification fires -> both are confirmed durable via the real REST read
 * path (GET /v1/conversations, GET /v1/conversations/{id}/messages,
 * GET /v1/notifications). Supersedes verify-realtime.mjs (Phase 1), which
 * tested the same pipeline shape but against an unauthenticated, unscoped
 * dev room - Phase 3 requires real authentication end to end.
 */
async function main() {
  // 1. Register
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Phase 3 Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  // 2. An unauthenticated socket connection must be rejected
  const anonSocket = io(BASE, { transports: ["websocket"] });
  const anonRejected = await new Promise((resolve) => {
    anonSocket.on("disconnect", () => resolve(true));
    setTimeout(() => resolve(false), 3000);
  });
  check("an unauthenticated socket connection is disconnected by the server", anonRejected);
  anonSocket.close();

  // 3. Connect an authenticated socket
  const socket = io(BASE, { auth: { token: accessToken }, transports: ["websocket"] });
  await new Promise((resolve, reject) => {
    socket.on("connect", resolve);
    socket.on("connect_error", reject);
    setTimeout(() => reject(new Error("socket connect timeout")), 5000);
  });
  check("authenticated socket connects", socket.connected);

  const messageReceived = new Promise((resolve) => socket.once("message.received", resolve));
  const notificationCreated = new Promise((resolve) => socket.once("notification.created", resolve));

  // 4. Trigger a mock message INTO this user's own real workspace (Bearer token, not the dev fixture)
  const sendRes = await fetch(`${BASE}/dev/mock-connector/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      senderDisplayName: "Deniz",
      senderExternalId: "deniz-phase3",
      bodyText: "Hey, are we still on for tomorrow?",
    }),
  });
  check("mock-connector/send (authenticated) returns 201", sendRes.status === 201);

  const [messagePayload, notificationPayload] = await Promise.all([
    Promise.race([messageReceived, timeout("message.received")]),
    Promise.race([notificationCreated, timeout("notification.created")]),
  ]);
  check("message.received arrived on the authenticated socket", Boolean(messagePayload?.id));
  check("notification.created arrived on the authenticated socket", Boolean(notificationPayload?.id));
  check(
    "the message's sender resolved through IdentityGraph and is shown by name",
    messagePayload?.sender?.displayName === "Deniz",
  );
  socket.close();

  // 5. Confirm durability via the real REST read path
  const conversations = await getJson(`${BASE}/v1/conversations`, accessToken);
  check("GET /v1/conversations returns the new conversation", conversations.length >= 1);
  const conversation = conversations[0];

  const messages = await getJson(`${BASE}/v1/conversations/${conversation.id}/messages`, accessToken);
  check("GET /v1/conversations/:id/messages returns the message", messages.some((m) => m.bodyText.includes("still on for tomorrow")));

  const notifications = await getJson(`${BASE}/v1/notifications`, accessToken);
  check("GET /v1/notifications returns the notification", notifications.length >= 1);

  // 6. A second, unrelated user must never see the first user's conversation (workspace isolation)
  const otherEmail = `phase3-other-${randomBytes(6).toString("hex")}@example.com`;
  const otherRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: otherEmail, password, displayName: "Other User" }),
  });
  const otherBody = await otherRes.json();
  const otherConversations = await getJson(`${BASE}/v1/conversations`, otherBody.accessToken);
  check("a second user's workspace has no visibility into the first user's conversation", otherConversations.length === 0);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

async function getJson(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  return res.json();
}

function timeout(label) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), 5000));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
