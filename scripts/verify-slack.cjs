const { randomBytes, createHmac } = require("node:crypto");

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `slack-${randomBytes(6).toString("hex")}@example.com`;
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

function signSlackRequest(signingSecret, timestamp, rawBody) {
  const base = `v0:${timestamp}:${rawBody}`;
  return `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;
}

/**
 * Live verification for the Slack connector (docs/ROADMAP.md Phase 7), run
 * against the actual running API. Unlike Discord's callback (a guild_id
 * the script can supply itself), Slack's OAuth v2 completion requires a
 * real authorization `code`, only obtainable via a real user clicking
 * through Slack's own consent screen in a browser - not scriptable, the
 * same class of disclosed gap verify-discord.cjs already documents for
 * its callback/backfill/reply flow. What *is* fully scriptable without an
 * install: the connect endpoint's real config-detection check, and the
 * Events API webhook's HMAC signature verification - real crypto on both
 * sides, exercised end-to-end against the actual running API.
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Slack Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  const connectRes = await fetch(`${BASE}/v1/connectors/slack/connect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!process.env.SLACK_CLIENT_ID || !process.env.SLACK_PUBLIC_BASE_URL) {
    check("connect without SLACK_CLIENT_ID/SLACK_PUBLIC_BASE_URL configured returns 503", connectRes.status === 503);
    console.log("\nSKIP: authorizationUrl checks (Slack app OAuth config not set - this is expected in CI)");
  } else {
    const connectBody = await connectRes.json();
    check("connect returns 201 with an authorizationUrl", connectRes.status === 201 && typeof connectBody.authorizationUrl === "string");
    check(
      "the authorizationUrl points at slack.com/oauth/v2/authorize",
      connectBody.authorizationUrl?.startsWith("https://slack.com/oauth/v2/authorize"),
    );
    const stateMatch = connectBody.authorizationUrl?.match(/state=([^&]+)/);
    check("the authorizationUrl carries a state parameter", Boolean(stateMatch?.[1]));
  }

  // The Events API signing secret is an independent piece of config from
  // the OAuth client id/secret (a Slack App has both, but they gate
  // different endpoints) - exercised here regardless of whether the OAuth
  // half above is configured, since this check needs no completed install.
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.log("\nSKIP: Events API signature verification (SLACK_SIGNING_SECRET not set - this is expected in CI)");
    console.log(`\n${passCount} passed, ${failCount} failed`);
    process.exit(failCount === 0 ? 0 : 1);
    return;
  }

  const challengeBody = JSON.stringify({ type: "url_verification", token: "verify-token", challenge: "verify-challenge-value" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const validSignature = signSlackRequest(signingSecret, timestamp, challengeBody);

  const validRes = await fetch(`${BASE}/v1/connectors/slack/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Slack-Request-Timestamp": timestamp,
      "X-Slack-Signature": validSignature,
    },
    body: challengeBody,
  });
  const validBody = await validRes.json().catch(() => ({}));
  check("a validly-signed url_verification request is accepted", validRes.status === 200);
  check("the challenge is echoed back", validBody.challenge === "verify-challenge-value");

  const invalidRes = await fetch(`${BASE}/v1/connectors/slack/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Slack-Request-Timestamp": timestamp,
      "X-Slack-Signature": "v0=0000000000000000000000000000000000000000000000000000000000000000",
    },
    body: challengeBody,
  });
  check("an invalidly-signed request is rejected with 401", invalidRes.status === 401);

  console.log("\nNOTE: full connect/callback/reply flow was not exercised - it requires a real user completing Slack's own OAuth consent screen in a browser, not scriptable.");
  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
