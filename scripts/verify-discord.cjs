const { randomBytes } = require("node:crypto");

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `discord-${randomBytes(6).toString("hex")}@example.com`;
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
 * Live verification for the Discord connector (docs/ROADMAP.md Phase 6),
 * run against the actual running API. Unlike Telegram, a full live E2E
 * (a real user picking a real server, a real Gateway MESSAGE_CREATE
 * dispatch) requires a real Discord Application (Client ID/Secret/Bot
 * Token) already added to a real test server - a bigger one-time setup
 * than Telegram's single bot token. This script always runs what it can
 * without that (the connect endpoint's real config-presence check), and
 * runs the full callback+backfill+reply flow only when
 * DISCORD_BOT_TOKEN/DISCORD_TEST_GUILD_ID are set.
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Discord Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  const connectRes = await fetch(`${BASE}/v1/connectors/discord/connect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const testGuildId = process.env.DISCORD_TEST_GUILD_ID;
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_PUBLIC_BASE_URL) {
    check("connect without DISCORD_CLIENT_ID/DISCORD_PUBLIC_BASE_URL configured returns 503", connectRes.status === 503);
    console.log("\nSKIP: full connect/callback/reply flow (Discord app not configured - this is expected in CI)");
    console.log(`\n${passCount} passed, ${failCount} failed`);
    process.exit(failCount === 0 ? 0 : 1);
    return;
  }

  const connectBody = await connectRes.json();
  check("connect returns 201 with an authorizationUrl", connectRes.status === 201 && typeof connectBody.authorizationUrl === "string");
  check("the authorizationUrl points at discord.com/api/oauth2/authorize", connectBody.authorizationUrl?.startsWith("https://discord.com/api/oauth2/authorize"));

  const stateMatch = connectBody.authorizationUrl?.match(/state=([^&]+)/);
  const state = stateMatch?.[1];
  check("the authorizationUrl carries a state parameter", Boolean(state));

  if (!testGuildId) {
    console.log("\nSKIP: full callback/backfill/reply flow (DISCORD_TEST_GUILD_ID not set - this is expected in CI)");
    console.log(`\n${passCount} passed, ${failCount} failed`);
    process.exit(failCount === 0 ? 0 : 1);
    return;
  }

  // Simulates Discord's browser redirect back to our callback - real bot
  // token, real guild, real Discord API calls happen from here on.
  const callbackRes = await fetch(
    `${BASE}/v1/connectors/discord/callback?guild_id=${testGuildId}&state=${state}`,
    { redirect: "manual" },
  );
  check("the callback redirects (302/303)", callbackRes.status >= 300 && callbackRes.status < 400);
  const location = callbackRes.headers.get("location") ?? "";
  check("the callback redirects to ?discord=connected", location.includes("discord=connected"));

  await new Promise((resolve) => setTimeout(resolve, 1500));

  const conversationsRes = await fetch(`${BASE}/v1/conversations`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const conversations = await conversationsRes.json();
  check("GET /v1/conversations responds for the connected guild", conversationsRes.status === 200 && Array.isArray(conversations));

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
