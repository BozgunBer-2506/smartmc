import { Logger } from "@nestjs/common";
import type { TransactionalEmailService } from "./transactional-email.service";

const RESEND_API_BASE = "https://api.resend.com";

/**
 * A Resend API call failed. Deliberately carries only the HTTP status, not
 * the response body - the exact error JSON shape is not fully documented by
 * Resend, and the response body could echo request content (recipient,
 * subject) back into an error object that gets logged. Mirrors
 * SlackRawApiError's status-carrying shape (packages/connector-sdk).
 */
export class ResendApiError extends Error {
  constructor(readonly status: number) {
    super(`Resend API error (status ${status})`);
    this.name = "ResendApiError";
  }
}

/**
 * Real Resend HTTP adapter (native fetch, no vendor SDK - matches this
 * repo's connector-sdk convention). Never logs the recipient address, the
 * API key, the Authorization header, the reset URL/token, or any part of
 * the request/response body - only a generic message plus HTTP status on
 * failure, per the explicit no-PII / no-secret-leakage requirement for
 * this adapter.
 */
export class ResendTransactionalEmailService implements TransactionalEmailService {
  private readonly logger = new Logger(ResendTransactionalEmailService.name);

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const { html, text } = buildPasswordResetEmail(resetUrl);

    let response: Response;
    try {
      response = await fetch(`${RESEND_API_BASE}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to,
          subject: "Reset your password",
          html,
          text,
        }),
      });
    } catch {
      // Never log the caught error itself: a fetch network error can embed
      // request details (e.g. the target URL with no token, but not worth
      // the risk of a future body-including error type).
      this.logger.error("Network error calling the Resend API.");
      throw new Error("Failed to reach the transactional-email provider.");
    }

    if (!response.ok) {
      this.logger.error(`Resend API returned an error response (status ${response.status}).`);
      throw new ResendApiError(response.status);
    }
  }
}

function buildPasswordResetEmail(resetUrl: string): { html: string; text: string } {
  const text = [
    "A password reset was requested for your account.",
    "",
    `Reset your password: ${resetUrl}`,
    "",
    "This link expires in 30 minutes.",
    "",
    "If you did not request this, you can safely ignore this email.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="font-family: sans-serif; line-height: 1.5;">
    <p>A password reset was requested for your account.</p>
    <p><a href="${resetUrl}">Reset your password</a></p>
    <p>This link expires in 30 minutes.</p>
    <p>If you did not request this, you can safely ignore this email.</p>
  </body>
</html>`;

  return { html, text };
}
