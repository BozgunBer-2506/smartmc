import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import type { EmailCredential, EmailMessage, SendEmailOptions } from "./email.types";

/**
 * An IMAP/SMTP call failed - both protocols' own error shapes (imapflow
 * throws `Error` subclasses with a `.responseText`/`.code`; nodemailer
 * throws `Error` with a `.responseCode`) are normalized into this one
 * type so mapError() has a single, consistent shape to classify, the
 * same pattern every other connector's Raw*ApiError uses.
 */
export class EmailRawApiError extends Error {
  constructor(
    readonly kind: "auth" | "connection" | "not_found" | "rate_limited" | "rejected" | "unknown",
    message: string,
  ) {
    super(message);
    this.name = "EmailRawApiError";
  }
}

const INBOX = "INBOX";

function classifyImapError(err: unknown): EmailRawApiError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes("auth") || lower.includes("login") || lower.includes("credentials")) {
    return new EmailRawApiError("auth", message);
  }
  if (lower.includes("no such mailbox") || lower.includes("not found")) {
    return new EmailRawApiError("not_found", message);
  }
  if (lower.includes("econnrefused") || lower.includes("timeout") || lower.includes("enotfound")) {
    return new EmailRawApiError("connection", message);
  }
  return new EmailRawApiError("unknown", message);
}

function classifySmtpError(err: unknown): EmailRawApiError {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { responseCode?: number }).responseCode;
  if (code === 421 || code === 450 || code === 451) return new EmailRawApiError("rate_limited", message);
  if (code === 535 || code === 534) return new EmailRawApiError("auth", message);
  if (code && code >= 550 && code < 560) return new EmailRawApiError("rejected", message);
  return classifyImapError(err);
}

/**
 * The IMAP/SMTP surface this connector needs. Injected into
 * EmailConnector so certification/tests can substitute a fake
 * implementation without real mailbox credentials or network access -
 * the same dependency-injection pattern every other connector uses.
 */
export interface EmailApiClient {
  /** Section 3.2's real, minimal validation call - opens and immediately closes both connections. */
  testConnection(credential: EmailCredential): Promise<void>;
  /** Bounded, cursor-based fetch (Section 4.2) - messages with UID > sinceUid, oldest first, capped at limit. */
  fetchMessages(credential: EmailCredential, folder: string, sinceUid: number, limit: number): Promise<EmailMessage[]>;
  sendMessage(credential: EmailCredential, options: SendEmailOptions): Promise<{ messageId: string }>;
}

export class RealEmailApiClient implements EmailApiClient {
  async testConnection(credential: EmailCredential): Promise<void> {
    const client = this.openImap(credential);
    try {
      await client.connect();
    } catch (err) {
      throw classifyImapError(err);
    } finally {
      await client.logout().catch(() => undefined);
    }

    const transport = this.openSmtp(credential);
    try {
      await transport.verify();
    } catch (err) {
      throw classifySmtpError(err);
    } finally {
      transport.close();
    }
  }

  async fetchMessages(credential: EmailCredential, folder: string, sinceUid: number, limit: number): Promise<EmailMessage[]> {
    const client = this.openImap(credential);
    const messages: EmailMessage[] = [];
    try {
      await client.connect();
      const lock = await client.getMailboxLock(folder);
      try {
        const range = `${sinceUid + 1}:*`;
        let count = 0;
        for await (const msg of client.fetch({ uid: range }, { uid: true, source: true })) {
          if (sinceUid > 0 && msg.uid <= sinceUid) continue; // imapflow's "*" can include the boundary UID itself
          if (count >= limit) break;
          count += 1;
          if (!msg.source) continue;

          // mailparser normalizes messageId/inReplyTo/references/from/subject/date/text
          // from the raw RFC 822 source in one pass - the same library
          // nodemailer's own maintainer publishes, chosen over hand-rolling
          // MIME parsing (multipart, quoted-printable, charset conversion)
          // for the same reason imapflow/nodemailer themselves are used
          // rather than a raw IMAP/SMTP socket implementation.
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.value?.[0];
          const references = Array.isArray(parsed.references)
            ? parsed.references
            : parsed.references
              ? [parsed.references]
              : [];

          messages.push({
            uid: msg.uid,
            folder,
            messageId: parsed.messageId ?? `<generated-${msg.uid}@no-message-id>`,
            inReplyTo: parsed.inReplyTo ?? undefined,
            references,
            from: { address: from?.address ?? "unknown@unknown", name: from?.name || undefined },
            subject: parsed.subject ?? "(no subject)",
            date: (parsed.date ?? new Date()).toISOString(),
            textBody: parsed.text?.trim() || "",
            isOwnMessage: from?.address?.toLowerCase() === credential.username.toLowerCase(),
          });
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      throw classifyImapError(err);
    } finally {
      await client.logout().catch(() => undefined);
    }
    return messages;
  }

  async sendMessage(credential: EmailCredential, options: SendEmailOptions): Promise<{ messageId: string }> {
    const transport = this.openSmtp(credential);
    try {
      const info = await transport.sendMail({
        from: credential.username,
        to: options.to,
        subject: options.subject,
        text: options.text,
        inReplyTo: options.inReplyTo,
        references: options.references,
      });
      return { messageId: info.messageId };
    } catch (err) {
      throw classifySmtpError(err);
    } finally {
      transport.close();
    }
  }

  private openImap(credential: EmailCredential): ImapFlow {
    return new ImapFlow({
      host: credential.imapHost,
      port: credential.imapPort,
      secure: credential.imapSecure,
      auth: { user: credential.username, pass: credential.password },
      logger: false,
    });
  }

  private openSmtp(credential: EmailCredential): nodemailer.Transporter {
    return nodemailer.createTransport({
      host: credential.smtpHost,
      port: credential.smtpPort,
      secure: credential.smtpSecure,
      auth: { user: credential.username, pass: credential.password },
    });
  }
}

export { INBOX };
