import { Injectable, Logger } from "@nestjs/common";
import type { TransactionalEmailService } from "./transactional-email.service";

/**
 * The production binding until a real provider (Resend/SES/Postmark/
 * SendGrid/SMTP) is chosen and implemented - deliberately NOT
 * `InMemoryTransactionalEmailService`, which is test/dev-only and must
 * never be reachable in production (that would mean production silently
 * "succeeding" at password-reset email delivery with nothing actually
 * sent - an operator would have no way to tell the difference from a
 * working system). This throws instead, loudly, server-side only -
 * `PasswordResetService.requestReset` catches it and still returns the
 * same enumeration-safe response either way, so this failure is never
 * externally observable, only internally (this log line + the audit
 * trail entry PasswordResetService writes on catch).
 */
@Injectable()
export class UnconfiguredTransactionalEmailService implements TransactionalEmailService {
  private readonly logger = new Logger(UnconfiguredTransactionalEmailService.name);

  async sendPasswordReset(to: string): Promise<void> {
    this.logger.error(
      `Password reset requested for a real account, but no transactional-email provider is configured in production. ` +
        `No email was sent for ${to}. Configure a real TransactionalEmailService implementation before real users rely on this flow.`,
    );
    throw new Error("No transactional-email provider is configured.");
  }
}
