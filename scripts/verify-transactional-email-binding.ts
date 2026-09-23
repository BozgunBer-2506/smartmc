/**
 * Config-level verification of the transactional-email provider selection
 * matrix (Auth Reliability Hardening correction V, extended for the Resend
 * integration's fail-fast requirement). Tests the actual exported
 * `resolveTransactionalEmailImplementation` selection logic and the
 * `transactional-email.config.ts` resolve/fail-fast logic directly - no
 * Nest DI container needed, no full server boot needed.
 */
import { resolveTransactionalEmailImplementation } from "../apps/api/src/transactional-email/resolve-transactional-email-implementation";
import { InMemoryTransactionalEmailService } from "../apps/api/src/transactional-email/in-memory-transactional-email.service";
import { UnconfiguredTransactionalEmailService } from "../apps/api/src/transactional-email/unconfigured-transactional-email.service";
import type { TransactionalEmailService } from "../apps/api/src/transactional-email/transactional-email.service";

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

// transactional-email.config.ts caches its result in module-level state,
// so each config scenario needs a fresh module instance - re-require with
// cache cleared, mirroring how other verify scripts in this repo isolate
// env-dependent singletons.
const ENV_KEYS = ["TRANSACTIONAL_EMAIL_PROVIDER", "RESEND_API_KEY", "TRANSACTIONAL_EMAIL_FROM"] as const;

function withConfigModule<T>(env: Record<string, string | undefined>, fn: (mod: typeof import("../apps/api/src/config/transactional-email.config")) => T): T {
  const modPath = require.resolve("../apps/api/src/config/transactional-email.config");
  delete require.cache[modPath];
  const prevValues: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    prevValues[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, env);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(modPath) as typeof import("../apps/api/src/config/transactional-email.config");
    return fn(mod);
  } finally {
    for (const key of ENV_KEYS) {
      if (prevValues[key] === undefined) delete process.env[key];
      else process.env[key] = prevValues[key];
    }
  }
}

function main() {
  const fake = new InMemoryTransactionalEmailService();
  const unconfigured = new UnconfiguredTransactionalEmailService();
  const resendSentinel: TransactionalEmailService = { sendPasswordReset: async () => {} };
  const createResend = () => resendSentinel;

  // --- Selection logic (config already resolved/validated) ---

  const noProviderConfig = { provider: "unconfigured" as const };
  const prodResolved = resolveTransactionalEmailImplementation("production", noProviderConfig, fake, unconfigured, createResend);
  check("production + no provider resolves to UnconfiguredTransactionalEmailService", prodResolved === unconfigured);
  check("production + no provider never resolves to the in-memory fake", prodResolved !== fake);

  const devResolved = resolveTransactionalEmailImplementation("development", noProviderConfig, fake, unconfigured, createResend);
  check("development + no provider resolves to the test/dev fake (unchanged local workflow)", devResolved === fake);

  const undefinedResolved = resolveTransactionalEmailImplementation(undefined, noProviderConfig, fake, unconfigured, createResend);
  check("an unset NODE_ENV (never valid in a real deploy) does not default to production's binding", undefinedResolved === fake);

  const resendConfig = { provider: "resend" as const, apiKey: "test-key", from: "test@example.com" };
  const prodResendResolved = resolveTransactionalEmailImplementation("production", resendConfig, fake, unconfigured, createResend);
  check("production + resend + complete config resolves to ResendTransactionalEmailService", prodResendResolved === resendSentinel);

  const devResendResolved = resolveTransactionalEmailImplementation("development", resendConfig, fake, unconfigured, createResend);
  check("development + resend + complete config also resolves to ResendTransactionalEmailService (explicit opt-in honored in any env)", devResendResolved === resendSentinel);

  check("production must never select InMemoryTransactionalEmailService, in any provider state", prodResolved !== fake && prodResendResolved !== fake);

  // --- Config-level fail-fast (transactional-email.config.ts) ---

  const unconfiguredThrew = withConfigModule({}, (mod) => {
    try {
      mod.transactionalEmailConfig.assertValid();
      return false;
    } catch {
      return true;
    }
  });
  check("no TRANSACTIONAL_EMAIL_PROVIDER set does not throw at boot (a supported deployment state)", !unconfiguredThrew);

  const completeThrew = withConfigModule(
    { TRANSACTIONAL_EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k", TRANSACTIONAL_EMAIL_FROM: "a@b.com" },
    (mod) => {
      try {
        mod.transactionalEmailConfig.assertValid();
        return false;
      } catch {
        return true;
      }
    },
  );
  check("resend + complete config does not throw at boot", !completeThrew);

  const missingKeyMessage = withConfigModule({ TRANSACTIONAL_EMAIL_PROVIDER: "resend", TRANSACTIONAL_EMAIL_FROM: "a@b.com" }, (mod) => {
    try {
      mod.transactionalEmailConfig.assertValid();
      return "";
    } catch (err) {
      return err instanceof Error ? err.message : "";
    }
  });
  check("resend + missing RESEND_API_KEY fails fast at boot", missingKeyMessage.includes("RESEND_API_KEY"));

  const missingFromMessage = withConfigModule({ TRANSACTIONAL_EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k" }, (mod) => {
    try {
      mod.transactionalEmailConfig.assertValid();
      return "";
    } catch (err) {
      return err instanceof Error ? err.message : "";
    }
  });
  check("resend + missing TRANSACTIONAL_EMAIL_FROM fails fast at boot", missingFromMessage.includes("TRANSACTIONAL_EMAIL_FROM"));

  const unsupportedThrew = withConfigModule({ TRANSACTIONAL_EMAIL_PROVIDER: "sendgrid" }, (mod) => {
    try {
      mod.transactionalEmailConfig.assertValid();
      return false;
    } catch {
      return true;
    }
  });
  check("an unsupported TRANSACTIONAL_EMAIL_PROVIDER value fails fast at boot", unsupportedThrew);

  console.log(`\n${passCount} passed, ${failCount} failed.`);
  process.exit(failCount > 0 ? 1 : 0);
}

main();
