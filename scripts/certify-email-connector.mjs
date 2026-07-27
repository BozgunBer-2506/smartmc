import { certifyConnector, EmailConnector, EMAIL_ERROR_FIXTURES, EMAIL_MESSAGE_FIXTURES } from "@smc/connector-sdk";

/**
 * Runs the Connector Certification Suite (docs/CONNECTOR_SDK.md Sections
 * 16-17) against EmailConnector, using a fake EmailApiClient so this runs
 * deterministically without a real mailbox or network access - matching
 * certify-telegram/discord/slack-connector.mjs.
 */
const MAILBOX_MESSAGES = [
  { uid: 201, folder: "INBOX", messageId: "<cert-1@example.test>", references: [], from: { address: "cert-sender@example.test", name: "Cert Sender" }, subject: "First certification message", date: new Date().toISOString(), textBody: "First certification message", isOwnMessage: false },
  { uid: 202, folder: "INBOX", messageId: "<cert-2@example.test>", inReplyTo: "<cert-1@example.test>", references: ["<cert-1@example.test>"], from: { address: "cert-sender@example.test", name: "Cert Sender" }, subject: "Re: First certification message", date: new Date().toISOString(), textBody: "Second certification message", isOwnMessage: false },
  { uid: 203, folder: "INBOX", messageId: "<cert-3@example.test>", references: [], from: { address: "cert-mailbox@example.test", name: "Cert Mailbox" }, subject: "Sent copy that must be filtered", date: new Date().toISOString(), textBody: "Own message", isOwnMessage: true },
];

const fakeApiClient = {
  async testConnection() {
    return undefined;
  },
  async fetchMessages(_credential, folder, sinceUid, limit) {
    return MAILBOX_MESSAGES.filter((m) => m.folder === folder && m.uid > sinceUid).slice(0, limit);
  },
  async sendMessage(_credential, options) {
    return { messageId: `<sent-${Date.now()}@example.test>` };
  },
};

const CREDENTIAL = {
  imapHost: "imap.cert.test",
  imapPort: 993,
  imapSecure: true,
  smtpHost: "smtp.cert.test",
  smtpPort: 465,
  smtpSecure: true,
  username: "cert-mailbox@example.test",
  password: "cert-password",
};

async function main() {
  const connector = new EmailConnector(fakeApiClient);

  const report = await certifyConnector(connector, {
    messageFixtures: EMAIL_MESSAGE_FIXTURES,
    errorFixtures: EMAIL_ERROR_FIXTURES,
    validCredential: CREDENTIAL,
    invalidCredential: { ...CREDENTIAL, password: "" },
    context: { credential: CREDENTIAL, linkedAccountId: "cert-account" },
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
