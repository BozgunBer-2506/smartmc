const { randomBytes } = require("node:crypto");

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `email-${randomBytes(6).toString("hex")}@example.com`;
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
 * Live verification for the Email connector (docs/ROADMAP.md Phase 8),
 * run against the actual running API:
 *
 * 1. Missing-field validation is real (no network call needed).
 * 2. A real IMAP connection attempt against a host that cannot possibly
 *    exist is really rejected (`POST /v1/connectors/email/connect` really
 *    calls out over the network via `validateCredential` - not mocked).
 * 3. A real, live SMTP send against this project's own local mailhog
 *    instance (docker-compose.yml) - genuine wire-protocol traffic,
 *    exercised directly through `@smc/connector-sdk`'s `RealEmailApiClient`
 *    since mailhog has no IMAP side to complete a full connect flow
 *    against, the same class of "provable without a full external
 *    account" check `verify-slack.cjs` runs for signature verification.
 * 4. If EMAIL_TEST_IMAP_HOST/EMAIL_TEST_IMAP_PORT/EMAIL_TEST_SMTP_HOST/
 *    EMAIL_TEST_SMTP_PORT/EMAIL_TEST_USERNAME/EMAIL_TEST_PASSWORD are all
 *    set (a real mailbox), the full connect/poll flow is exercised too.
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Email Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  // 1. Missing fields are rejected before any network call.
  const missingFieldsRes = await fetch(`${BASE}/v1/connectors/email/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ username: "incomplete@example.test" }),
  });
  check("connect with missing fields returns 400", missingFieldsRes.status === 400);

  // 2. A real IMAP connection attempt to a host that cannot resolve is
  // really rejected - not a mocked/simulated failure.
  const badConnectRes = await fetch(`${BASE}/v1/connectors/email/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      imapHost: "imap.invalid.nonexistent.smartmessagecenter.test",
      imapPort: 993,
      imapSecure: true,
      smtpHost: "smtp.invalid.nonexistent.smartmessagecenter.test",
      smtpPort: 465,
      smtpSecure: true,
      username: "nobody@example.test",
      password: "wrong-password",
    }),
  });
  const badConnectBody = await badConnectRes.json();
  check("connect with an unreachable host returns 422", badConnectRes.status === 422);
  check("connect with an unreachable host reports code INVALID_EMAIL_CREDENTIAL", badConnectBody.code === "INVALID_EMAIL_CREDENTIAL");

  // 3. A real, live SMTP send against this project's own local mailhog -
  // genuine wire protocol, not mocked.
  try {
    const { RealEmailApiClient } = require("@smc/connector-sdk");
    const client = new RealEmailApiClient();
    const sent = await client.sendMessage(
      {
        imapHost: "localhost",
        imapPort: 993,
        imapSecure: true,
        smtpHost: "localhost",
        smtpPort: 1025,
        smtpSecure: false,
        username: "verify@smartmessagecenter.test",
        password: "unused-mailhog-ignores-auth",
      },
      { to: "recipient@smartmessagecenter.test", subject: "Live SMTP verification", text: "Sent by verify-email.cjs against mailhog." },
    );
    check("a real SMTP send against mailhog succeeds and returns a messageId", Boolean(sent.messageId));
  } catch (err) {
    check(`a real SMTP send against mailhog succeeds and returns a messageId (error: ${err.message})`, false);
  }

  const realHost = process.env.EMAIL_TEST_IMAP_HOST;
  if (!realHost) {
    console.log("\nSKIP: full connect/poll flow (EMAIL_TEST_IMAP_HOST and friends not set - this is expected in CI)");
    console.log(`\n${passCount} passed, ${failCount} failed`);
    process.exit(failCount === 0 ? 0 : 1);
    return;
  }

  const connectRes = await fetch(`${BASE}/v1/connectors/email/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      imapHost: realHost,
      imapPort: Number(process.env.EMAIL_TEST_IMAP_PORT ?? 993),
      imapSecure: true,
      smtpHost: process.env.EMAIL_TEST_SMTP_HOST,
      smtpPort: Number(process.env.EMAIL_TEST_SMTP_PORT ?? 465),
      smtpSecure: true,
      username: process.env.EMAIL_TEST_USERNAME,
      password: process.env.EMAIL_TEST_PASSWORD,
    }),
  });
  const connectBody = await connectRes.json();
  check("connect with a real mailbox returns 201", connectRes.status === 201);
  check("the LinkedAccount's status is active", connectBody.status === "active");

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const conversationsRes = await fetch(`${BASE}/v1/conversations`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const conversations = await conversationsRes.json();
  check("GET /v1/conversations responds for the connected mailbox", conversationsRes.status === 200 && Array.isArray(conversations));

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
