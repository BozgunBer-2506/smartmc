import { certifyConnector, DiscordConnector, DiscordRawApiError, DISCORD_ERROR_FIXTURES, DISCORD_MESSAGE_FIXTURES } from "@smc/connector-sdk";

/**
 * Runs the Connector Certification Suite (docs/CONNECTOR_SDK.md Sections
 * 16-17) against DiscordConnector, using a fake DiscordApiClient so this
 * runs deterministically without a real bot token or network access -
 * matching certify-mock-connector.mjs and certify-telegram-connector.mjs.
 */
let nextMessageId = 5_000_000_000_000_000_000n;

const CHANNEL_ID = "900000000000000099";
const GUILD_ID = "800000000000000099";

function textMessage(id, content, authorId = "700000000000000099", bot = false) {
  return {
    id,
    channel_id: CHANNEL_ID,
    guild_id: GUILD_ID,
    author: { id: authorId, username: "cert-user", bot },
    content,
    timestamp: new Date().toISOString(),
  };
}

const CHANNEL_MESSAGES = [
  textMessage("100", "First certification message"),
  textMessage("101", "Second certification message"),
  textMessage("102", "Bot message that must be filtered", "700000000000000098", true),
];

const fakeApiClient = {
  async getMe() {
    return { id: "700000000000000000", username: "cert-bot", bot: true };
  },
  async getGuild(_token, guildId) {
    if (guildId === GUILD_ID) return { id: guildId, name: "Cert Guild" };
    throw new DiscordRawApiError(404, "Unknown Guild");
  },
  async listGuildChannels() {
    return [{ id: CHANNEL_ID, guild_id: GUILD_ID, name: "general", type: 0 }];
  },
  async listChannelMessages() {
    return CHANNEL_MESSAGES;
  },
  async sendMessage(_token, channelId, content) {
    nextMessageId += 1n;
    return { id: String(nextMessageId), channel_id: channelId, author: { id: "700000000000000000", username: "cert-bot", bot: true }, content, timestamp: new Date().toISOString() };
  },
};

async function main() {
  const connector = new DiscordConnector(fakeApiClient);

  const report = await certifyConnector(connector, {
    messageFixtures: DISCORD_MESSAGE_FIXTURES,
    errorFixtures: DISCORD_ERROR_FIXTURES,
    validCredential: { botToken: "cert-bot-token", guildId: GUILD_ID },
    invalidCredential: { botToken: "cert-bot-token", guildId: "wrong-guild" },
    context: { credential: { botToken: "cert-bot-token", guildId: GUILD_ID }, linkedAccountId: "cert-account" },
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
