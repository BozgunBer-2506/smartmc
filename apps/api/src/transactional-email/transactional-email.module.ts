import { Module } from "@nestjs/common";
import { DevTransactionalEmailController } from "./dev-transactional-email.controller";
import { InMemoryTransactionalEmailService } from "./in-memory-transactional-email.service";
import { resolveTransactionalEmailImplementation } from "./resolve-transactional-email-implementation";
import { TRANSACTIONAL_EMAIL_SERVICE } from "./transactional-email.service";
import { UnconfiguredTransactionalEmailService } from "./unconfigured-transactional-email.service";

export { resolveTransactionalEmailImplementation };

/**
 * The single provider-wiring point ADR-0016's precedent calls for -
 * swapping to a real vendor later means adding a new implementation class
 * and changing this factory, nothing else in the codebase.
 *
 * `InMemoryTransactionalEmailService` (test/dev-only) is bound outside
 * production; `UnconfiguredTransactionalEmailService` is bound in
 * production instead, deliberately - it's the one that makes "no real
 * provider configured" loudly observable server-side rather than
 * silently indistinguishable from a working send. Resolved once via
 * `NODE_ENV`, not per-request, matching this codebase's existing
 * env-gated-at-boot pattern (credentials-store.config.ts's fail-fast).
 */
@Module({
  controllers: [DevTransactionalEmailController],
  providers: [
    InMemoryTransactionalEmailService,
    UnconfiguredTransactionalEmailService,
    {
      provide: TRANSACTIONAL_EMAIL_SERVICE,
      useFactory: (fake: InMemoryTransactionalEmailService, unconfigured: UnconfiguredTransactionalEmailService) =>
        resolveTransactionalEmailImplementation(process.env.NODE_ENV, fake, unconfigured),
      inject: [InMemoryTransactionalEmailService, UnconfiguredTransactionalEmailService],
    },
  ],
  exports: [TRANSACTIONAL_EMAIL_SERVICE],
})
export class TransactionalEmailModule {}
