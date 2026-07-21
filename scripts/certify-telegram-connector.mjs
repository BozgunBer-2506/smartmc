import { certifyConnector, TelegramConnector, TelegramRawApiError, TELEGRAM_ERROR_FIXTURES, TELEGRAM_MESSAGE_FIXTURES } from "@smc/connector-sdk";

/**
 * Runs the Connector Certification Suite (docs/CONNECTOR_SDK.md Sections
 * 16-17) against TelegramConnector, using a fake TelegramApiClient so this
 * runs deterministically without a real bot token or network access -
 * matching how certify-mock-connector.mjs works. Real-network verification
 * (a real invalid-token rejection, a real webhook payload end to end) is
 * scripts/verify-telegram.mjs's job, not this one's.
 */
let nextMessageId = 9000;

const fakeApiClient = {
  async getMe(token) {
    if (token === "cert-valid-token") {
      return { id: 555000111, is_bot: true, first_name: "Cert Bot", username: "smc_cert_bot" };
    }
    throw new TelegramRawApiError(401, "Unauthorized");
  },
  async sendMessage(token, chatId, text) {
    nextMessageId += 1;
    return { message_id: nextMessageId, date: Math.floor(Date.now() / 1000), chat: { id: Number(chatId), type: "private" }, text };
  },
  async setWebhook() {},
  async deleteWebhook() {},
  async getWebhookInfo() {
    return { url: "https://example.invalid/webhook", has_custom_certificate: false, pending_update_count: 1 };
  },
  async getUpdates(token, offset) {
    const start = offset ?? 700;
    return [
      {
        update_id: start,
        message: {
          message_id: 8001,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 42, type: "private", first_name: "Recovered" },
          from: { id: 42, is_bot: false, first_name: "Recovered" },
          text: "Recovered via reconciliation drain.",
        },
      },
    ];
  },
};

async function main() {
  const connector = new TelegramConnector(fakeApiClient);

  const report = await certifyConnector(connector, {
    messageFixtures: TELEGRAM_MESSAGE_FIXTURES,
    errorFixtures: TELEGRAM_ERROR_FIXTURES,
    validCredential: "cert-valid-token",
    invalidCredential: "cert-invalid-token",
    context: { credential: "cert-valid-token", linkedAccountId: "cert-account", metadata: { webhookSecret: "cert-secret" } },
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
