import {
  certifyConnector,
  mockConnector,
  MOCK_ERROR_FIXTURES,
  MOCK_MESSAGE_FIXTURES,
} from "@smc/connector-sdk";

/**
 * Runs the Connector Certification Suite (docs/CONNECTOR_SDK.md Sections
 * 16-17) against the Mock Connector - the reference implementation every
 * future connector (Telegram, Discord, Slack, Email) is held to the same
 * bar as. docs/ROADMAP.md Phase 4 Sprint 1's Definition of Done requires
 * this to pass before the Mock Connector migration is considered complete.
 */
async function main() {
  mockConnector.simulateFailure(null);

  const report = await certifyConnector(mockConnector, {
    messageFixtures: MOCK_MESSAGE_FIXTURES,
    errorFixtures: MOCK_ERROR_FIXTURES,
    validCredential: "mock-valid-certification-credential",
    invalidCredential: "not-a-valid-credential",
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
