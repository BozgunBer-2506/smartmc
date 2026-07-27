/**
 * The subset of an IMAP-fetched email message this connector actually
 * uses - normalized once here (imapflow's own envelope shape), not a full
 * RFC 822 representation. `uid` is the IMAP UID within `folder`, the
 * cursor unit `CONNECTOR_SDK.md` Section 4.2 requires ("cursor-based,
 * never full-refetch").
 */
export interface EmailMessage {
  uid: number;
  folder: string;
  messageId: string;
  inReplyTo?: string;
  /** Oldest-first, per RFC 2822's own ordering convention - the thread root is references[0] when present. */
  references: string[];
  from: { address: string; name?: string };
  subject: string;
  date: string; // ISO 8601
  textBody: string;
  /** True for a message this same mailbox sent (IMAP has no bot-authored-message concept like Discord/Slack, but a mailbox can see its own Sent-folder-mirrored message via some providers' IMAP setups) - filtered the same way other connectors filter self-authored messages. */
  isOwnMessage: boolean;
}

export interface EmailCredential {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  /** Threading headers (RFC 2822) - set whenever replying within an existing thread so the provider's own client groups it correctly, mirroring what `mapMessage()` reads back out. */
  inReplyTo?: string;
  references?: string[];
}
