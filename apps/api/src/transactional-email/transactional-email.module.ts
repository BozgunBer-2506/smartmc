import { Module } from "@nestjs/common";
import { transactionalEmailConfig } from "../config/transactional-email.config";
import { DevTransactionalEmailController } from "./dev-transactional-email.controller";
import { InMemoryTransactionalEmailService } from "./in-memory-transactional-email.service";
import { ResendTransactionalEmailService } from "./resend-transactional-email.service";
import { resolveTransactionalEmailImplementation } from "./resolve-transactional-email-implementation";
import { TRANSACTIONAL_EMAIL_SERVICE } from "./transactional-email.service";
import { UnconfiguredTransactionalEmailService } from "./unconfigured-transactional-email.service";

export { resolveTransactionalEmailImplementation };

/**
 * The single provider-wiring point ADR-0016's precedent calls for -
 * swapping to a real vendor later means adding a new implementation class
 * and changing this factory, nothing else in the codebase.
 *
 * `InMemoryTransactionalEmailService` (test/dev-only) is bound when no
 * provider is configured outside production; `UnconfiguredTransactionalEmailService`
 * is bound instead in production, deliberately - it's the one that makes
 * "no real provider configured" loudly observable server-side rather than
 * silently indistinguishable from a working send. `ResendTransactionalEmailService`
 * is bound in any environment once TRANSACTIONAL_EMAIL_PROVIDER=resend is
 * explicitly set, with config validated (and misconfiguration turned into
 * a boot-time crash) by transactionalEmailConfig.assertValid() in main.ts,
 * before this factory ever runs - matching credentials-store.config.ts's
 * fail-fast-at-boot precedent.
 */
@Module({
  controllers: [DevTransactionalEmailController],
  providers: [
    InMemoryTransactionalEmailService,
    UnconfiguredTransactionalEmailService,
    {
      provide: TRANSACTIONAL_EMAIL_SERVICE,
      useFactory: (fake: InMemoryTransactionalEmailService, unconfigured: UnconfiguredTransactionalEmailService) =>
        resolveTransactionalEmailImplementation(
          process.env.NODE_ENV,
          transactionalEmailConfig.get(),
          fake,
          unconfigured,
          (apiKey, from) => new ResendTransactionalEmailService(apiKey, from),
        ),
      inject: [InMemoryTransactionalEmailService, UnconfiguredTransactionalEmailService],
    },
  ],
  exports: [TRANSACTIONAL_EMAIL_SERVICE],
})
export class TransactionalEmailModule {}
