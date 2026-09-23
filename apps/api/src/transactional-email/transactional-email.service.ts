/**
 * Provider-neutral boundary for platform-sent transactional email (Auth
 * Reliability Hardening) - deliberately separate from `apps/api/src/email`,
 * which is the Email *connector* (a user's own IMAP/SMTP mailbox SmartMC
 * ingests/sends through), not platform-to-user mail. `AuthService`/
 * `PasswordResetService` depend on this interface only, never a vendor SDK
 * directly - swapping in a real provider later (Resend/SES/Postmark/
 * SendGrid/SMTP) means implementing this interface and changing one
 * provider-wiring point (transactional-email.module.ts), the same pattern
 * ADR-0016 already established for CredentialsStoreService.
 *
 * No real provider is selected or installed yet - that's an explicit,
 * separate decision (external account, likely paid, domain verification)
 * deferred until the owner chooses one. The only implementation wired in
 * today is test/dev-only (see in-memory-transactional-email.service.ts) -
 * real password-reset email delivery does not happen yet.
 */
export const TRANSACTIONAL_EMAIL_SERVICE = Symbol("TRANSACTIONAL_EMAIL_SERVICE");

export interface TransactionalEmailService {
  sendPasswordReset(to: string, resetUrl: string): Promise<void>;
}
