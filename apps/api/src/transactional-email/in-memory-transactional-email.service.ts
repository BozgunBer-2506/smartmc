import { Injectable } from "@nestjs/common";
import type { TransactionalEmailService } from "./transactional-email.service";

export interface SentEmail {
  to: string;
  resetUrl: string;
  sentAt: Date;
}

/**
 * Test/dev-only `TransactionalEmailService` - the only implementation
 * wired in until a real provider is chosen (see transactional-email.service.ts's
 * own comment). Deliberately does NOT print the reset URL/token anywhere
 * (no console.log, no logger) - it only holds sent emails in an in-process
 * array for a verification script to inspect via `getSentEmails()`. Never
 * bind this in a real production deployment expecting real users to
 * receive a real email; nothing here delivers one.
 */
@Injectable()
export class InMemoryTransactionalEmailService implements TransactionalEmailService {
  private readonly sent: SentEmail[] = [];

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    this.sent.push({ to, resetUrl, sentAt: new Date() });
  }

  /** Test-only inspection - never used by application code. */
  getSentEmails(): readonly SentEmail[] {
    return this.sent;
  }

  /** Test-only - lets a verification script reset state between scenarios. */
  clear(): void {
    this.sent.length = 0;
  }
}
