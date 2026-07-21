import { defineCapabilityManifest } from "../capability-manifest";
import { BaseConnector } from "../connector";
import { ConnectorError, type ConnectorErrorCode } from "../errors";
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
import { RealTelegramApiClient, TelegramRawApiError, type TelegramApiClient } from "./telegram-api-client";
import type { TelegramChat, TelegramMessage, TelegramUpdate } from "./telegram.types";

export const TELEGRAM_PROVIDER_KEY = "telegram";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapTelegramErrorCode(httpLikeCode: number, retryAfter?: number): ConnectorErrorCode {
  if (retryAfter || httpLikeCode === 429) return "RATE_LIMITED";
  if (httpLikeCode === 401) return "AUTH_EXPIRED";
  if (httpLikeCode === 404) return "RESOURCE_NOT_FOUND";
  if (httpLikeCode === 403) return "PERMISSION_DENIED";
  if (httpLikeCode === 400) return "PAYLOAD_REJECTED";
  if (httpLikeCode >= 500) return "PROVIDER_UNAVAILABLE";
  return "UNKNOWN";
}

function chatDisplayName(chat: TelegramChat): string {
  const personal = [chat.first_name, chat.last_name].filter(Boolean).join(" ");
  return chat.title || personal || chat.username || `Chat ${chat.id}`;
}

function placeholderBodyText(message: TelegramMessage): string {
  if (message.photo) return "[Photo]";
  if (message.video) return "[Video]";
  if (message.document) return "[Document]";
  if (message.voice) return "[Voice message]";
  if (message.sticker) return "[Sticker]";
  return "[Unsupported message content]";
}

/**
 * The first real connector (docs/ROADMAP.md Phase 4 Sprint 2), built on
 * Sprint 1's SDK. Two Telegram-specific limitations shape this class -
 * both recorded in ADR-0017 rather than silently worked around:
 * the Bot API has no message-history endpoint (initialSync is a real,
 * documented no-op), and getUpdates/setWebhook are mutually exclusive on
 * one bot (reconcile() briefly removes and restores the webhook to drain
 * a backlog via getUpdates, rather than diffing against a list endpoint
 * that doesn't exist for this provider).
 */
export class TelegramConnector extends BaseConnector {
  readonly capabilityManifest = defineCapabilityManifest({
    providerKey: TELEGRAM_PROVIDER_KEY,
    displayName: "Telegram",
    ingestionMode: "hybrid",
    // Shorter than the 15-30 min default (CONNECTOR_SDK.md Section 4.3) -
    // ADR-0017's drain recovers a real backlog, not just a health signal,
    // so there's value in checking more often.
    reconciliationIntervalMinutes: 5,
    messageEditing: true,
    messageDeletion: false,
    reactions: false,
    threads: false,
    readReceipts: false,
    typingIndicators: true,
    groupManagement: "read_write",
    maxAttachmentSizeBytes: 20 * 1024 * 1024, // Bot API's own file download ceiling
    supportedAttachmentTypes: ["image", "video", "document", "voice"],
    rateLimits: { requestsPerSecond: 30, burst: 10 }, // Telegram's documented ~30 msg/sec outbound ceiling
  });

  constructor(private readonly apiClient: TelegramApiClient = new RealTelegramApiClient()) {
    super();
  }

  async validateCredential(credential: unknown): Promise<CredentialValidationResult> {
    if (typeof credential !== "string" || credential.trim().length === 0) {
      return { valid: false, reason: "A Telegram bot token is required." };
    }
    try {
      await this.apiClient.getMe(credential);
      return { valid: true };
    } catch (err) {
      return { valid: false, reason: err instanceof Error ? err.message : "Telegram rejected this token." };
    }
  }

  protected async onCredentialValidated(credential: unknown): Promise<AuthenticationResult> {
    const me = await this.apiClient.getMe(credential as string);
    return { accountExternalId: String(me.id) };
  }

  /** ADR-0017: the Bot API has no history endpoint - there is nothing to backfill. */
  async initialSync(checkpoint?: SyncCheckpoint, _context?: ConnectorContext): Promise<SyncResult> {
    return {
      messages: [],
      checkpoint: { cursor: checkpoint?.cursor ?? null, processedCount: checkpoint?.processedCount ?? 0 },
      complete: true,
    };
  }

  /**
   * ADR-0017's reconciliation strategy: check Telegram's own backlog/error
   * signal (getWebhookInfo), and only if it indicates a problem, drain the
   * backlog via getUpdates (which requires briefly removing the webhook)
   * and restore the webhook afterward.
   */
  async reconcile(checkpoint?: SyncCheckpoint, context?: ConnectorContext): Promise<SyncResult> {
    const token = this.requireCredential(context);

    let info;
    try {
      info = await this.apiClient.getWebhookInfo(token);
    } catch (err) {
      throw this.mapError(err);
    }

    const needsDrain = info.pending_update_count > 0 || Boolean(info.last_error_date);
    if (!needsDrain) {
      return { messages: [], checkpoint: checkpoint ?? { cursor: null, processedCount: 0 }, complete: true };
    }

    const webhookUrl = info.url;
    const webhookSecret = typeof context?.metadata?.webhookSecret === "string" ? context.metadata.webhookSecret : "";
    let messages: NormalizedMessage[] = [];
    let nextOffset = checkpoint?.cursor ? Number(checkpoint.cursor) : undefined;

    try {
      await this.apiClient.deleteWebhook(token);
      const updates = await this.apiClient.getUpdates(token, nextOffset, 0);
      messages = updates.filter((update) => update.message || update.edited_message).map((update) => this.mapMessage(update));
      if (updates.length > 0) {
        nextOffset = Math.max(...updates.map((update) => update.update_id)) + 1;
      }
    } finally {
      if (webhookUrl) {
        await this.apiClient.setWebhook(token, webhookUrl, webhookSecret).catch(() => undefined);
      }
    }

    return {
      messages,
      checkpoint: {
        cursor: nextOffset !== undefined ? String(nextOffset) : (checkpoint?.cursor ?? null),
        processedCount: (checkpoint?.processedCount ?? 0) + messages.length,
      },
      complete: true,
    };
  }

  async send(message: OutboundMessage, context?: ConnectorContext): Promise<SendResult> {
    const token = this.requireCredential(context);
    try {
      const sent = await this.apiClient.sendMessage(token, message.conversationExternalId, message.bodyText);
      return { externalId: String(sent.message_id), queued: false };
    } catch (err) {
      const mapped = this.mapError(err);
      if (mapped.code === "RATE_LIMITED") {
        // Backpressure, never a silent drop (CONNECTOR_SDK.md Section 14) -
        // honor Telegram's own retry_after (Section 7: provider-declared
        // backoff is authoritative) and retry once.
        const retryAfterMs = err instanceof TelegramRawApiError && err.retryAfter ? err.retryAfter * 1000 : 1000;
        await delay(retryAfterMs);
        const sent = await this.apiClient.sendMessage(token, message.conversationExternalId, message.bodyText);
        return { externalId: String(sent.message_id), queued: true };
      }
      throw mapped;
    }
  }

  mapMessage(rawPayload: unknown): NormalizedMessage {
    const update = rawPayload as TelegramUpdate;
    const message = update.message ?? update.edited_message;
    if (!message) {
      throw new Error("TelegramConnector.mapMessage() received an update with no message/edited_message content.");
    }

    const sender = message.from;
    const chat = message.chat;

    return {
      externalId: String(message.message_id),
      conversationExternalId: String(chat.id),
      conversationTitle: chatDisplayName(chat),
      direction: "inbound",
      bodyText: message.text ?? message.caption ?? placeholderBodyText(message),
      receivedAt: new Date(message.date * 1000).toISOString(),
      senderExternalId: sender ? String(sender.id) : String(chat.id),
      senderHandle: sender?.username ? `@${sender.username}` : undefined,
      senderDisplayName: sender
        ? [sender.first_name, sender.last_name].filter(Boolean).join(" ") || sender.username || "Unknown"
        : chatDisplayName(chat),
    };
  }

  mapError(rawError: unknown): ConnectorError {
    if (rawError instanceof TelegramRawApiError) {
      return new ConnectorError(mapTelegramErrorCode(rawError.errorCode, rawError.retryAfter), rawError.message);
    }
    if (rawError instanceof Error) {
      return new ConnectorError("UNKNOWN", rawError.message);
    }
    return new ConnectorError("UNKNOWN", "Unknown Telegram connector error.");
  }

  private requireCredential(context?: ConnectorContext): string {
    if (typeof context?.credential !== "string" || context.credential.length === 0) {
      throw new ConnectorError("AUTH_EXPIRED", "TelegramConnector call made without a resolved bot token in context.");
    }
    return context.credential;
  }
}
