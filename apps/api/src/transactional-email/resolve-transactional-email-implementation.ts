import type { TransactionalEmailService } from "./transactional-email.service";

/**
 * Deliberately its own file, with no NestJS decorator imports at all
 * (unlike transactional-email.module.ts, which pulls in
 * DevTransactionalEmailController's route decorators as a side effect
 * of import) - so a plain ts-node script can verify this exact decision
 * function in isolation, without needing a full Nest-decorator-aware
 * compile (scripts/verify-transactional-email-binding.ts).
 */
export function resolveTransactionalEmailImplementation(
  nodeEnv: string | undefined,
  fake: TransactionalEmailService,
  unconfigured: TransactionalEmailService,
): TransactionalEmailService {
  return nodeEnv === "production" ? unconfigured : fake;
}
