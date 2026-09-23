import type { TransactionalEmailProviderConfig } from "../config/transactional-email.config";
import type { TransactionalEmailService } from "./transactional-email.service";

/**
 * Pure selection logic, decorator-free so it can be imported by verify
 * scripts without booting Nest. The fail-fast checks (missing Resend
 * config, unsupported provider value) already happened in
 * transactionalEmailConfig.assertValid() at boot - by the time this runs,
 * `config` is guaranteed valid. This function only decides which
 * TransactionalEmailService instance to bind.
 */
export function resolveTransactionalEmailImplementation(
  nodeEnv: string | undefined,
  config: TransactionalEmailProviderConfig,
  fake: TransactionalEmailService,
  unconfigured: TransactionalEmailService,
  createResend: (apiKey: string, from: string) => TransactionalEmailService,
): TransactionalEmailService {
  if (config.provider === "resend") {
    return createResend(config.apiKey, config.from);
  }
  return nodeEnv === "production" ? unconfigured : fake;
}
