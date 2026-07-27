import { defineCapabilityManifest } from "../capability-manifest";
import { BaseConnector } from "../connector";
import { ConnectorError } from "../errors";
import type {
  AuthenticationResult,
  ConnectorContext,
  CredentialValidationResult,
  NormalizedMessage,
  OutboundMessage,
  SendResult,
  SyncCheckpoint,
  SyncResult,
} from "../types";
import { EmailRawApiError, INBOX, RealEmailApiClient, type EmailApiClient } from "./email-api-client";
import type { EmailCredential, EmailMessage } from "./email.types";

export const EMAIL_PROVIDER_KEY = "email";

const MESSAGES_PER_POLL_BOUND = 50;

interface EmailSyncCursor {
  folder: string;
  sinceUid: number;
}

/** The thread a message belongs to (`ROADMAP.md` Phase 8: "Threading mapped to Conversation model") - the oldest ancestor in `References`, falling back to `In-Reply-To`, falling back to the message's own id when it starts a new thread. A pure function of the message's own headers, never a lookup - `NormalizedMessage.conversationExternalId` is a free-form provider-chosen string, no SDK change needed to give email a different meaning for it than a chat provider's channel id. */
function resolveThreadId(message: EmailMessage): string {
  return message.references[0] ?? message.inReplyTo ?? message.messageId;
}

function mapEmailErrorCode(kind: EmailRawApiError["kind"]): ConnectorError["code"] {
  switch (kind) {
    case "auth":
      return "AUTH_EXPIRED";
    case "rate_limited":
      return "RATE_LIMITED";
    case "not_found":
      return "RESOURCE_NOT_FOUND";
    case "rejected":
      return "PAYLOAD_REJECTED";
    case "connection":
      return "PROVIDER_UNAVAILABLE";
    default:
      return "UNKNOWN";
  }
}

/**
 * The fourth real connector (docs/ROADMAP.md Phase 8), and the first
 * built on `credential_entry` auth (`CONNECTOR_SDK.md` Section 3.1 -
 * host/port/username/password, validated via a real connection attempt)
 * combined with `"polling"` ingestion (Section 4.2 - IMAP without a push
 * mechanism is that section's own worked example). Both were already
 * fully specified before this phase; no `Connector` interface change was
 * needed, confirming `ROADMAP.md`'s own prediction that Phase 7/8 should
 * not force one the way Discord's Gateway did (ADR-0019, Phase 6).
 *
 * `"polling"` is not in `requiresReconciliation()`'s set - unlike
 * webhook/hybrid/streaming connectors, there is no separate backstop
 * pass here: polling *is* the primary ingestion mechanism, and
 * `reconcile()` below is simply another poll cycle from the same
 * durable cursor, not a distinct correctness mechanism layered on top.
 */
export class EmailConnector extends BaseConnector {
  readonly capabilityManifest = defineCapabilityManifest({
    providerKey: EMAIL_PROVIDER_KEY,
    displayName: "Email",
    ingestionMode: "polling",
    messageEditing: false,
    messageDeletion: false,
    reactions: false,
    threads: true,
    readReceipts: false,
    typingIndicators: false,
    groupManagement: "read_only",
    maxAttachmentSizeBytes: 25 * 1024 * 1024,
    supportedAttachmentTypes: ["document", "image"],
    rateLimits: { requestsPerSecond: 2, burst: 5 },
  });

  constructor(private readonly apiClient: EmailApiClient = new RealEmailApiClient()) {
    super();
  }

  async validateCredential(credential: unknown): Promise<CredentialValidationResult> {
    const parsed = this.parseCredential(credential);
    if (!parsed) {
      return { valid: false, reason: "IMAP/SMTP host, port, and mailbox credentials are all required." };
    }
    try {
      // Section 3.2: one real, minimal call before any credential is
      // ever persisted - here, a real IMAP login plus a real SMTP
      // `verify()`, not just a syntactic shape check.
      await this.apiClient.testConnection(parsed);
      return { valid: true };
    } catch (err) {
      return { valid: false, reason: err instanceof Error ? err.message : "The mail server rejected this credential." };
    }
  }

  protected async onCredentialValidated(credential: unknown): Promise<AuthenticationResult> {
    const parsed = this.parseCredential(credential);
    if (!parsed) {
      throw new ConnectorError("AUTH_EXPIRED", "Missing email credential during authenticate().");
    }
    return { accountExternalId: parsed.username };
  }

  async initialSync(checkpoint?: SyncCheckpoint, context?: ConnectorContext): Promise<SyncResult> {
    return this.poll(checkpoint, context);
  }

  /** For a polling connector, reconciling is just another poll from the same durable cursor - there is no separate list-and-diff endpoint the way Discord/Slack's channel history provides; IMAP's UID ordering already guarantees nothing is skipped between cycles. */
  async reconcile(checkpoint?: SyncCheckpoint, context?: ConnectorContext): Promise<SyncResult> {
    return this.poll(checkpoint, context);
  }

  async send(message: OutboundMessage, context?: ConnectorContext): Promise<SendResult> {
    const credential = this.requireCredential(context);
    try {
      const sent = await this.apiClient.sendMessage(credential, {
        to: message.conversationExternalId,
        subject: "Re: your conversation",
        text: message.bodyText,
        inReplyTo: message.conversationExternalId,
        references: [message.conversationExternalId],
      });
      return { externalId: sent.messageId, queued: false };
    } catch (err) {
      throw this.mapError(err);
    }
  }

  mapMessage(rawPayload: unknown): NormalizedMessage {
    const message = rawPayload as EmailMessage;
    return {
      externalId: message.messageId,
      conversationExternalId: resolveThreadId(message),
      conversationTitle: message.subject,
      direction: "inbound",
      bodyText: message.textBody || "[Empty message]",
      receivedAt: message.date,
      senderExternalId: message.from.address,
      senderHandle: message.from.address,
      senderDisplayName: message.from.name || message.from.address,
    };
  }

  mapError(rawError: unknown): ConnectorError {
    if (rawError instanceof EmailRawApiError) {
      return new ConnectorError(mapEmailErrorCode(rawError.kind), rawError.message);
    }
    if (rawError instanceof Error) {
      return new ConnectorError("UNKNOWN", rawError.message);
    }
    return new ConnectorError("UNKNOWN", "Unknown email connector error.");
  }

  private async poll(checkpoint: SyncCheckpoint | undefined, context: ConnectorContext | undefined): Promise<SyncResult> {
    const credential = this.requireCredential(context);

    let cursor: EmailSyncCursor;
    if (checkpoint?.cursor) {
      cursor = JSON.parse(checkpoint.cursor) as EmailSyncCursor;
    } else {
      cursor = { folder: INBOX, sinceUid: 0 };
    }

    const rawMessages = await this.apiClient.fetchMessages(credential, cursor.folder, cursor.sinceUid, MESSAGES_PER_POLL_BOUND);
    const messages = rawMessages.filter((message) => !message.isOwnMessage).map((message) => this.mapMessage(message));

    const highestUid = rawMessages.length > 0 ? Math.max(...rawMessages.map((m) => m.uid)) : cursor.sinceUid;
    const nextCursor: EmailSyncCursor = { folder: cursor.folder, sinceUid: highestUid };

    return {
      messages,
      checkpoint: {
        cursor: JSON.stringify(nextCursor),
        processedCount: (checkpoint?.processedCount ?? 0) + messages.length,
      },
      // A poll cycle is always "complete" - there is no multi-page
      // backfill state machine to walk (unlike Discord/Slack's
      // channel-by-channel cursor advancement); the next new message
      // arrives on the next poll interval, not the next call in this batch.
      complete: true,
    };
  }

  private parseCredential(credential: unknown): EmailCredential | null {
    if (typeof credential !== "object" || credential === null) return null;
    const c = credential as Partial<EmailCredential>;
    if (
      typeof c.imapHost === "string" &&
      c.imapHost.length > 0 &&
      typeof c.imapPort === "number" &&
      typeof c.imapSecure === "boolean" &&
      typeof c.smtpHost === "string" &&
      c.smtpHost.length > 0 &&
      typeof c.smtpPort === "number" &&
      typeof c.smtpSecure === "boolean" &&
      typeof c.username === "string" &&
      c.username.length > 0 &&
      typeof c.password === "string" &&
      c.password.length > 0
    ) {
      return c as EmailCredential;
    }
    return null;
  }

  private requireCredential(context?: ConnectorContext): EmailCredential {
    const parsed = this.parseCredential(context?.credential);
    if (!parsed) {
      throw new ConnectorError("AUTH_EXPIRED", "EmailConnector call made without resolved IMAP/SMTP credentials in context.");
    }
    return parsed;
  }
}
