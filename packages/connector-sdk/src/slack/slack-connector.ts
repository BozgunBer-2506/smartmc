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
import { RealSlackApiClient, SlackRawApiError, type SlackApiClient } from "./slack-api-client";
import type { SlackMessage } from "./slack.types";

export const SLACK_PROVIDER_KEY = "slack";

/** Slack's actual credential shape: unlike Discord's one app-wide bot token, Slack's OAuth v2 install flow issues a genuinely distinct bot token per workspace (`xoxb-...`), so both fields are per-LinkedAccount, not platform-wide config. */
export interface SlackCredential {
  botToken: string;
  teamId: string;
}

const MAX_CHANNELS_TO_SYNC = 5;
const MESSAGES_PER_CHANNEL_BOUND = 50;

interface SlackSyncCursor {
  channelIds: string[];
  channelIndex: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const AUTH_ERRORS = new Set(["invalid_auth", "account_inactive", "token_revoked", "token_expired"]);
const PERMISSION_ERRORS = new Set(["missing_scope", "not_in_channel", "restricted_action"]);
const PAYLOAD_ERRORS = new Set(["invalid_arguments", "msg_too_long", "no_text"]);

function mapSlackErrorCode(status: number, slackError: string): ConnectorErrorCode {
  if (status === 429) return "RATE_LIMITED";
  if (AUTH_ERRORS.has(slackError)) return "AUTH_EXPIRED";
  if (slackError === "channel_not_found") return "RESOURCE_NOT_FOUND";
  if (PERMISSION_ERRORS.has(slackError)) return "PERMISSION_DENIED";
  if (PAYLOAD_ERRORS.has(slackError)) return "PAYLOAD_REJECTED";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "UNKNOWN";
}

function placeholderBodyText(message: SlackMessage): string {
  if (message.subtype) return "[Attachment]";
  return "[Empty message]";
}

/**
 * The third real connector (docs/ROADMAP.md Phase 7), and the first to
 * combine `oauth2_redirect` auth (like Discord) with "hybrid" webhook +
 * reconciliation ingestion (like Telegram) - no new SDK interface member
 * was needed for either half, confirming ROADMAP.md's own sequencing
 * expectation that Phase 7 would not force another Connector interface
 * change the way Discord's Gateway (ADR-0019) did.
 */
export class SlackConnector extends BaseConnector {
  readonly capabilityManifest = defineCapabilityManifest({
    providerKey: SLACK_PROVIDER_KEY,
    displayName: "Slack",
    ingestionMode: "hybrid",
    reconciliationIntervalMinutes: 15,
    messageEditing: true,
    messageDeletion: true,
    reactions: false,
    threads: false,
    readReceipts: false,
    typingIndicators: false,
    groupManagement: "read_only",
    maxAttachmentSizeBytes: 1024 * 1024 * 1024,
    supportedAttachmentTypes: ["image", "video", "document"],
    rateLimits: { requestsPerSecond: 1, burst: 5 },
  });

  constructor(private readonly apiClient: SlackApiClient = new RealSlackApiClient()) {
    super();
  }

  async validateCredential(credential: unknown): Promise<CredentialValidationResult> {
    const parsed = this.parseCredential(credential);
    if (!parsed) {
      return { valid: false, reason: "A Slack bot token and team id are required." };
    }
    try {
      // Validates the token actually authenticates against this specific
      // workspace (Section 3.2), not just that it's syntactically a token.
      const result = await this.apiClient.authTest(parsed.botToken);
      if (result.teamId !== parsed.teamId) {
        return { valid: false, reason: "This bot token does not belong to the expected Slack workspace." };
      }
      return { valid: true };
    } catch (err) {
      return { valid: false, reason: err instanceof Error ? err.message : "Slack rejected this token." };
    }
  }

  protected async onCredentialValidated(credential: unknown): Promise<AuthenticationResult> {
    const parsed = this.parseCredential(credential);
    if (!parsed) {
      throw new ConnectorError("AUTH_EXPIRED", "Missing Slack credential during authenticate().");
    }
    return { accountExternalId: parsed.teamId };
  }

  async initialSync(checkpoint?: SyncCheckpoint, context?: ConnectorContext): Promise<SyncResult> {
    return this.syncChannels(checkpoint, context);
  }

  /** A real diff-and-backfill pass (CONNECTOR_SDK.md Section 4.3) - Slack's conversations.history endpoint makes this genuinely possible, the same proof point Discord's real history endpoint already established for a second provider. */
  async reconcile(checkpoint?: SyncCheckpoint, context?: ConnectorContext): Promise<SyncResult> {
    return this.syncChannels(checkpoint, context);
  }

  async send(message: OutboundMessage, context?: ConnectorContext): Promise<SendResult> {
    const { botToken } = this.requireCredential(context);
    try {
      const sent = await this.apiClient.postMessage(botToken, message.conversationExternalId, message.bodyText);
      return { externalId: sent.ts, queued: false };
    } catch (err) {
      const mapped = this.mapError(err);
      if (mapped.code === "RATE_LIMITED") {
        const retryAfterMs = err instanceof SlackRawApiError && err.retryAfter ? err.retryAfter * 1000 : 1000;
        await delay(retryAfterMs);
        const sent = await this.apiClient.postMessage(botToken, message.conversationExternalId, message.bodyText);
        return { externalId: sent.ts, queued: true };
      }
      throw mapped;
    }
  }

  mapMessage(rawPayload: unknown): NormalizedMessage {
    const message = rawPayload as SlackMessage;
    return {
      externalId: message.ts,
      conversationExternalId: message.channel,
      direction: "inbound",
      bodyText: message.text || placeholderBodyText(message),
      receivedAt: new Date(Number(message.ts.split(".")[0]) * 1000).toISOString(),
      senderExternalId: message.user ?? message.channel,
      senderHandle: message.user ? `@${message.user}` : undefined,
      senderDisplayName: message.user ?? "Unknown",
    };
  }

  mapError(rawError: unknown): ConnectorError {
    if (rawError instanceof SlackRawApiError) {
      return new ConnectorError(mapSlackErrorCode(rawError.status, rawError.slackError), rawError.message);
    }
    if (rawError instanceof Error) {
      return new ConnectorError("UNKNOWN", rawError.message);
    }
    return new ConnectorError("UNKNOWN", "Unknown Slack connector error.");
  }

  private async syncChannels(checkpoint: SyncCheckpoint | undefined, context: ConnectorContext | undefined): Promise<SyncResult> {
    const { botToken } = this.requireCredential(context);

    let cursor: SlackSyncCursor;
    if (checkpoint?.cursor) {
      cursor = JSON.parse(checkpoint.cursor) as SlackSyncCursor;
    } else {
      const channels = await this.apiClient.listConversations(botToken);
      // conversations.list returns every channel in the workspace, most of
      // which the bot has never joined - conversations.history 400s with
      // not_in_channel on any of those despite channels:history/
      // groups:history being granted. Only channels the bot is actually a
      // member of can have their history read.
      const joinedChannels = channels.filter((channel) => channel.is_member);
      const channelIds = joinedChannels.slice(0, MAX_CHANNELS_TO_SYNC).map((channel) => channel.id);
      cursor = { channelIds, channelIndex: 0 };
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
      const nextCursor: SlackSyncCursor = { channelIds: cursor.channelIds, channelIndex: cursor.channelIndex + 1 };
      return {
        messages: [],
        checkpoint: { cursor: JSON.stringify(nextCursor), processedCount: checkpoint?.processedCount ?? 0 },
        complete: nextCursor.channelIndex >= nextCursor.channelIds.length,
      };
    }

    const { messages: rawMessages } = await this.apiClient.conversationsHistory(botToken, channelId, undefined, MESSAGES_PER_CHANNEL_BOUND);
    // conversations.history's own messages don't carry `channel` (it's
    // implied by the request) - attached here so mapMessage() sees the
    // same shape as an Events API payload always does.
    const messages = rawMessages
      .filter((message) => !message.bot_id && message.type === "message")
      .map((message) => this.mapMessage({ ...message, channel: channelId }));

    const nextCursor: SlackSyncCursor = { channelIds: cursor.channelIds, channelIndex: cursor.channelIndex + 1 };
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

  private parseCredential(credential: unknown): SlackCredential | null {
    if (
      typeof credential === "object" &&
      credential !== null &&
      "botToken" in credential &&
      "teamId" in credential &&
      typeof (credential as SlackCredential).botToken === "string" &&
      typeof (credential as SlackCredential).teamId === "string" &&
      (credential as SlackCredential).botToken.length > 0 &&
      (credential as SlackCredential).teamId.length > 0
    ) {
      return credential as SlackCredential;
    }
    return null;
  }

  private requireCredential(context?: ConnectorContext): SlackCredential {
    const parsed = this.parseCredential(context?.credential);
    if (!parsed) {
      throw new ConnectorError("AUTH_EXPIRED", "SlackConnector call made without a resolved bot token/team id in context.");
    }
    return parsed;
  }
}
