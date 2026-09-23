/**
 * Config-level verification that production can never resolve
 * TRANSACTIONAL_EMAIL_SERVICE to the test/dev-only in-memory fake
 * (Auth Reliability Hardening, correction V). Tests the actual exported
 * `resolveTransactionalEmailImplementation` function directly - no Nest
 * DI container needed, no full server boot needed.
 */
import { resolveTransactionalEmailImplementation } from "../apps/api/src/transactional-email/resolve-transactional-email-implementation";
import { InMemoryTransactionalEmailService } from "../apps/api/src/transactional-email/in-memory-transactional-email.service";
import { UnconfiguredTransactionalEmailService } from "../apps/api/src/transactional-email/unconfigured-transactional-email.service";

let passCount = 0;
let failCount = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passCount += 1;
  } else {
    console.error(`FAIL: ${label}`);
    failCount += 1;
  }
}

function main() {
  const fake = new InMemoryTransactionalEmailService();
  const unconfigured = new UnconfiguredTransactionalEmailService();

  const prodResolved = resolveTransactionalEmailImplementation("production", fake, unconfigured);
  check("V. NODE_ENV=production resolves to UnconfiguredTransactionalEmailService, never the fake", prodResolved === unconfigured);
  check("V. NODE_ENV=production never resolves to InMemoryTransactionalEmailService", prodResolved !== fake);

  const devResolved = resolveTransactionalEmailImplementation("development", fake, unconfigured);
  check("V. NODE_ENV=development resolves to the test/dev fake (unchanged local workflow)", devResolved === fake);

  const undefinedResolved = resolveTransactionalEmailImplementation(undefined, fake, unconfigured);
  check("V. an unset NODE_ENV (never valid in a real deploy) does not default to production's binding", undefinedResolved === fake);

  console.log(`\n${passCount} passed, ${failCount} failed.`);
  process.exit(failCount > 0 ? 1 : 0);
}

main();
