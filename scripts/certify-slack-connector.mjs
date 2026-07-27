import { certifyConnector, SlackConnector, SLACK_ERROR_FIXTURES, SLACK_MESSAGE_FIXTURES } from "@smc/connector-sdk";

/**
 * Runs the Connector Certification Suite (docs/CONNECTOR_SDK.md Sections
 * 16-17) against SlackConnector, using a fake SlackApiClient so this runs
 * deterministically without a real bot token or network access - matching
 * certify-telegram-connector.mjs and certify-discord-connector.mjs.
 */
let nextTs = 1_800_000_000;

const CHANNEL_ID = "C0000000099";
const TEAM_ID = "T0000000099";

function textMessage(ts, text, user = "U0000000099", botId) {
  return { type: "message", channel: CHANNEL_ID, user, text, ts, team: TEAM_ID, ...(botId ? { bot_id: botId } : {}) };
}

const CHANNEL_MESSAGES = [
  textMessage("100.000001", "First certification message"),
  textMessage("101.000002", "Second certification message"),
  textMessage("102.000003", "Bot message that must be filtered", "U0000000098", "B0000000001"),
];

const fakeApiClient = {
  async authTest(_token) {
    return { teamId: TEAM_ID, team: "Cert Team", userId: "U0000000000" };
  },
  async listConversations() {
    return [{ id: CHANNEL_ID, name: "general", is_channel: true }];
  },
  async conversationsHistory() {
    return { messages: CHANNEL_MESSAGES };
  },
  async postMessage(_token, channel, _text) {
    nextTs += 1;
    return { ts: String(nextTs), channel };
  },
  async oauthV2Access() {
    return { ok: true, access_token: "cert-bot-token", team: { id: TEAM_ID, name: "Cert Team" } };
  },
};

async function main() {
  const connector = new SlackConnector(fakeApiClient);

  const report = await certifyConnector(connector, {
    messageFixtures: SLACK_MESSAGE_FIXTURES,
    errorFixtures: SLACK_ERROR_FIXTURES,
    validCredential: { botToken: "cert-bot-token", teamId: TEAM_ID },
    invalidCredential: { botToken: "cert-bot-token", teamId: "wrong-team" },
    context: { credential: { botToken: "cert-bot-token", teamId: TEAM_ID }, linkedAccountId: "cert-account" },
  });

  for (const result of report.results) {
    if (result.skipped) {
      console.log(`SKIP: ${result.name} (${result.detail})`);
    } else if (result.passed) {
      console.log(`PASS: ${result.name}`);
    } else {
      console.error(`FAIL: ${result.name} - ${result.detail}`);
    }
  }

  const passCount = report.results.filter((r) => r.passed && !r.skipped).length;
  const skipCount = report.results.filter((r) => r.skipped).length;
  const failCount = report.results.filter((r) => !r.passed).length;

  console.log(`\n${passCount} passed, ${skipCount} skipped, ${failCount} failed`);
  console.log(`\nCertification for provider "${report.providerKey}": ${report.passed ? "PASSED" : "FAILED"}`);

  process.exit(report.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
