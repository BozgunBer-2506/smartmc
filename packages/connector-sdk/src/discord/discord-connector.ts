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
  StreamHandle,
  SyncCheckpoint,
  SyncResult,
} from "../types";
import { DiscordRawApiError, RealDiscordApiClient, type DiscordApiClient } from "./discord-api-client";
import { connectDiscordGateway } from "./discord-gateway-client";
import type { DiscordMessage } from "./discord.types";

export const DISCORD_PROVIDER_KEY = "discord";

/** Discord's actual credential shape (ADR-0019): one app-wide bot token, scoped per LinkedAccount to a specific guild - not a 1-token-per-account model like Telegram. The `unknown` credential parameter on the Connector interface is exactly what makes this possible without an interface change. */
export interface DiscordCredential {
  botToken: string;
  guildId: string;
}

const MAX_CHANNELS_TO_SYNC = 5;
const MESSAGES_PER_CHANNEL_BOUND = 50;

interface DiscordSyncCursor {
  channelIds: string[];
  channelIndex: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapDiscordErrorCode(status: number, retryAfter?: number): ConnectorErrorCode {
  if (retryAfter || status === 429) return "RATE_LIMITED";
  if (status === 401) return "AUTH_EXPIRED";
  if (status === 404) return "RESOURCE_NOT_FOUND";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 400) return "PAYLOAD_REJECTED";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "UNKNOWN";
}

function placeholderBodyText(message: DiscordMessage): string {
  if (message.attachments && message.attachments.length > 0) return "[Attachment]";
  return "[Empty message]";
}

/**
 * The second real connector (docs/ROADMAP.md Phase 6), and the first
 * whose ingestion is "streaming" (ADR-0019) rather than webhook-shaped.
 * Unlike Telegram, Discord's REST API has a real message-history endpoint,
 * so initialSync/reconcile are implemented for real here, not as a
 * documented no-op - this is the SDK's first genuine test against a
 * provider with the "typical" shape CONNECTOR_SDK.md Section 8.1/4.3
 * originally assumed.
 */
export class DiscordConnector extends BaseConnector {
  readonly capabilityManifest = defineCapabilityManifest({
    providerKey: DISCORD_PROVIDER_KEY,
    displayName: "Discord",
    ingestionMode: "streaming",
    reconciliationIntervalMinutes: 15,
    messageEditing: true,
    messageDeletion: false,
    reactions: false,
    threads: false,
    readReceipts: false,
    typingIndicators: false,
    groupManagement: "read_write",
    maxAttachmentSizeBytes: 25 * 1024 * 1024,
    supportedAttachmentTypes: ["image", "video", "document"],
    rateLimits: { requestsPerSecond: 5, burst: 5 },
  });

  constructor(private readonly apiClient: DiscordApiClient = new RealDiscordApiClient()) {
    super();
  }

  async validateCredential(credential: unknown): Promise<CredentialValidationResult> {
    const parsed = this.parseCredential(credential);
    if (!parsed) {
      return { valid: false, reason: "A Discord bot token and guild id are required." };
    }
    try {
      // Validates the bot can actually see this specific guild (Section
      // 3.2) - not just that the token is globally valid, which alone
      // wouldn't prove the bot was ever added to this server.
      await this.apiClient.getGuild(parsed.botToken, parsed.guildId);
      return { valid: true };
    } catch (err) {
      return { valid: false, reason: err instanceof Error ? err.message : "Discord rejected this token/guild." };
    }
  }

  protected async onCredentialValidated(credential: unknown): Promise<AuthenticationResult> {
    const parsed = this.parseCredential(credential);
    if (!parsed) {
      throw new ConnectorError("AUTH_EXPIRED", "Missing Discord credential during authenticate().");
    }
    return { accountExternalId: parsed.guildId };
  }

  async initialSync(checkpoint?: SyncCheckpoint, context?: ConnectorContext): Promise<SyncResult> {
    return this.syncChannels(checkpoint, context);
  }

  /** A real diff-and-backfill pass (CONNECTOR_SDK.md Section 4.3), not a health-check stub - Discord's history endpoint makes this genuinely possible, unlike Telegram (ADR-0017). Re-fetched messages already ingested are safe no-ops via the existing idempotent dedup. */
  async reconcile(checkpoint?: SyncCheckpoint, context?: ConnectorContext): Promise<SyncResult> {
    return this.syncChannels(checkpoint, context);
  }

  async send(message: OutboundMessage, context?: ConnectorContext): Promise<SendResult> {
    const { botToken } = this.requireCredential(context);
    try {
      const sent = await this.apiClient.sendMessage(botToken, message.conversationExternalId, message.bodyText);
      return { externalId: sent.id, queued: false };
    } catch (err) {
      const mapped = this.mapError(err);
      if (mapped.code === "RATE_LIMITED") {
        const retryAfterMs = err instanceof DiscordRawApiError && err.retryAfter ? err.retryAfter * 1000 : 1000;
        await delay(retryAfterMs);
        const sent = await this.apiClient.sendMessage(botToken, message.conversationExternalId, message.bodyText);
        return { externalId: sent.id, queued: true };
      }
      throw mapped;
    }
  }

  /** ADR-0019: opens a real Discord Gateway connection; every non-bot MESSAGE_CREATE dispatch is forwarded raw to the platform via `onMessage`. */
  async startListening(context: ConnectorContext, onMessage: (rawPayload: unknown) => void): Promise<StreamHandle> {
    const { botToken } = this.requireCredential(context);
    return connectDiscordGateway(botToken, (message) => {
      if (message.author?.bot) return; // never ingest our own sends or other bots' messages
      onMessage(message);
    });
  }

  mapMessage(rawPayload: unknown): NormalizedMessage {
    const message = rawPayload as DiscordMessage;
    return {
      externalId: message.id,
      conversationExternalId: message.channel_id,
      direction: "inbound",
      bodyText: message.content || placeholderBodyText(message),
      receivedAt: new Date(message.timestamp).toISOString(),
      senderExternalId: message.author.id,
      senderHandle: `@${message.author.username}`,
      senderDisplayName: message.author.global_name || message.author.username,
    };
  }

  mapError(rawError: unknown): ConnectorError {
    if (rawError instanceof DiscordRawApiError) {
      return new ConnectorError(mapDiscordErrorCode(rawError.status, rawError.retryAfter), rawError.message);
    }
    if (rawError instanceof Error) {
      return new ConnectorError("UNKNOWN", rawError.message);
    }
    return new ConnectorError("UNKNOWN", "Unknown Discord connector error.");
  }

  private async syncChannels(checkpoint: SyncCheckpoint | undefined, context: ConnectorContext | undefined): Promise<SyncResult> {
    const { botToken, guildId } = this.requireCredential(context);

    let cursor: DiscordSyncCursor;
    if (checkpoint?.cursor) {
      cursor = JSON.parse(checkpoint.cursor) as DiscordSyncCursor;
    } else {
      const channels = await this.apiClient.listGuildChannels(botToken, guildId);
      const textChannelIds = channels
        .filter((channel) => channel.type === 0)
        .slice(0, MAX_CHANNELS_TO_SYNC)
        .map((channel) => channel.id);
      cursor = { channelIds: textChannelIds, channelIndex: 0 };
    }

    if (cursor.channelIndex >= cursor.channelIds.length) {
      return {
        messages: [],
        checkpoint: { cursor: JSON.stringify(cursor), processedCount: checkpoint?.processedCount ?? 0 },
        complete: true,
      };
    }

    const channelId = cursor.channelIds[cursor.channelIndex];
    if (!channelId) {
      const nextCursor: DiscordSyncCursor = { channelIds: cursor.channelIds, channelIndex: cursor.channelIndex + 1 };
      return {
        messages: [],
        checkpoint: { cursor: JSON.stringify(nextCursor), processedCount: checkpoint?.processedCount ?? 0 },
        complete: nextCursor.channelIndex >= nextCursor.channelIds.length,
      };
    }
    const rawMessages = await this.apiClient.listChannelMessages(botToken, channelId, undefined, MESSAGES_PER_CHANNEL_BOUND);
    const messages = rawMessages.filter((message) => !message.author?.bot).map((message) => this.mapMessage(message));

    const nextCursor: DiscordSyncCursor = { channelIds: cursor.channelIds, channelIndex: cursor.channelIndex + 1 };
    const complete = nextCursor.channelIndex >= nextCursor.channelIds.length;

    return {
      messages,
      checkpoint: {
        cursor: JSON.stringify(nextCursor),
        processedCount: (checkpoint?.processedCount ?? 0) + messages.length,
      },
      complete,
    };
  }

  private parseCredential(credential: unknown): DiscordCredential | null {
    if (
      typeof credential === "object" &&
      credential !== null &&
      "botToken" in credential &&
      "guildId" in credential &&
      typeof (credential as DiscordCredential).botToken === "string" &&
      typeof (credential as DiscordCredential).guildId === "string" &&
      (credential as DiscordCredential).botToken.length > 0 &&
      (credential as DiscordCredential).guildId.length > 0
    ) {
      return credential as DiscordCredential;
    }
    return null;
  }

  private requireCredential(context?: ConnectorContext): DiscordCredential {
    const parsed = this.parseCredential(context?.credential);
    if (!parsed) {
      throw new ConnectorError("AUTH_EXPIRED", "DiscordConnector call made without a resolved bot token/guild id in context.");
    }
    return parsed;
  }
}
