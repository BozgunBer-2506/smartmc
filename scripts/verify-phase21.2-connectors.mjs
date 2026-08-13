import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `p21-2-${randomBytes(6).toString("hex")}@example.com`;
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
 * Live verification for Phase 21.2 (docs/ROADMAP.md) - the connector
 * management visibility gap found while fixing Phase 21.1: a workspace's
 * connected connectors had no listing endpoint at all. Run against the
 * actual running API.
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Phase 21.2 Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  // 1. Unauthenticated is rejected.
  const unauthRes = await fetch(`${BASE}/v1/connectors`);
  check("GET /v1/connectors without a token returns 401", unauthRes.status === 401);

  // 2. A fresh workspace with nothing connected returns an empty list, not an error.
  const emptyRes = await fetch(`${BASE}/v1/connectors`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const emptyBody = await emptyRes.json();
  check("GET /v1/connectors returns 200 for a fresh workspace", emptyRes.status === 200);
  check("a fresh workspace has an empty connector list", Array.isArray(emptyBody.data) && emptyBody.data.length === 0);

  // 3. Real Telegram connect -> shows up in the list with the right shape.
  const realTelegramToken = process.env.TELEGRAM_TEST_BOT_TOKEN;
  if (!realTelegramToken) {
    console.log("\nSKIP: full connect -> list flow (TELEGRAM_TEST_BOT_TOKEN not set - this is expected in CI)");
    console.log(`\n${passCount} passed, ${failCount} failed`);
    process.exit(failCount === 0 ? 0 : 1);
    return;
  }

  const connectRes = await fetch(`${BASE}/v1/connectors/telegram/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ botToken: realTelegramToken }),
  });
  check("real Telegram connect succeeds", connectRes.status === 201);
  const connectBody = await connectRes.json();

  const listRes = await fetch(`${BASE}/v1/connectors`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const listBody = await listRes.json();
  check("the connected Telegram account appears in the list", listBody.data.some((c) => c.id === connectBody.id));
  const entry = listBody.data.find((c) => c.id === connectBody.id);
  check("the entry reports provider=telegram", entry?.provider === "telegram");
  check("the entry reports status=active", entry?.status === "active");
  check("the entry's externalAccountId matches the real bot", entry?.externalAccountId === connectBody.externalAccountId);
  check("the entry has no lastError while healthy", entry?.lastError === null);
  check(
    "the entry does not leak the raw bot token anywhere in its JSON",
    !JSON.stringify(entry).includes(realTelegramToken),
  );

  // 4. Workspace isolation: a second, unrelated user sees an empty list, not the first user's connector.
  const email2 = `p21-2-b-${randomBytes(6).toString("hex")}@example.com`;
  const register2Res = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email2, password, displayName: "Phase 21.2 Verify Bot 2" }),
  });
  const register2Body = await register2Res.json();
  const list2Res = await fetch(`${BASE}/v1/connectors`, { headers: { Authorization: `Bearer ${register2Body.accessToken}` } });
  const list2Body = await list2Res.json();
  check("a second, unrelated workspace does not see the first workspace's connector", list2Body.data.length === 0);

  // 5. Disconnect removes it from the live list (soft delete, per Phase 21.1's `withSoftDeletes` behavior).
  await fetch(`${BASE}/v1/connectors/telegram/${connectBody.id}/disconnect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const afterDisconnectRes = await fetch(`${BASE}/v1/connectors`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const afterDisconnectBody = await afterDisconnectRes.json();
  check("a disconnected connector no longer appears in the list", !afterDisconnectBody.data.some((c) => c.id === connectBody.id));

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
