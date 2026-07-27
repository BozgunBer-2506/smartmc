import type { SlackChannel, SlackMessage, SlackOAuthAccessResponse } from "./slack.types";

const SLACK_API_BASE = "https://slack.com/api";

/**
 * A Slack Web API call failed - either a real HTTP-level failure (429 with
 * Retry-After, 5xx) or Slack's own quirk of returning HTTP 200 with
 * `{ ok: false, error: "..." }` for API-level errors. Both are normalized
 * into this one type so mapError() has a single, consistent shape to
 * classify, the same pattern DiscordRawApiError/TelegramRawApiError use.
 */
export class SlackRawApiError extends Error {
  constructor(
    readonly status: number,
    readonly slackError: string,
    readonly retryAfter?: number,
  ) {
    super(slackError);
    this.name = "SlackRawApiError";
  }
}

/**
 * The Slack Web API surface this connector needs. Injected into
 * SlackConnector so certification/tests can substitute a fake
 * implementation without a real bot token or network access - the same
 * dependency-injection pattern Telegram/Discord's connectors use.
 */
export interface SlackApiClient {
  authTest(botToken: string): Promise<{ teamId: string; team: string; userId: string }>;
  listConversations(botToken: string): Promise<SlackChannel[]>;
  conversationsHistory(botToken: string, channel: string, cursor?: string, limit?: number): Promise<{ messages: SlackMessage[]; nextCursor?: string }>;
  postMessage(botToken: string, channel: string, text: string): Promise<{ ts: string; channel: string }>;
  /** OAuth v2 code exchange (https://api.slack.com/authentication/oauth-v2) - app-wide client credentials, not a per-workspace secret. */
  oauthV2Access(clientId: string, clientSecret: string, code: string, redirectUri: string): Promise<SlackOAuthAccessResponse>;
}

export class RealSlackApiClient implements SlackApiClient {
  async authTest(botToken: string): Promise<{ teamId: string; team: string; userId: string }> {
    const json = await this.call<{ team_id: string; team: string; user_id: string }>(botToken, "auth.test");
    return { teamId: json.team_id, team: json.team, userId: json.user_id };
  }

  async listConversations(botToken: string): Promise<SlackChannel[]> {
    const json = await this.call<{ channels: SlackChannel[] }>(botToken, "conversations.list", { types: "public_channel,private_channel" });
    return json.channels ?? [];
  }

  async conversationsHistory(botToken: string, channel: string, cursor?: string, limit = 50): Promise<{ messages: SlackMessage[]; nextCursor?: string }> {
    const params: Record<string, string> = { channel, limit: String(limit) };
    if (cursor) params.cursor = cursor;
    const json = await this.call<{ messages: SlackMessage[]; response_metadata?: { next_cursor?: string } }>(
      botToken,
      "conversations.history",
      params,
    );
    return { messages: json.messages ?? [], nextCursor: json.response_metadata?.next_cursor || undefined };
  }

  async postMessage(botToken: string, channel: string, text: string): Promise<{ ts: string; channel: string }> {
    const json = await this.call<{ ts: string; channel: string }>(botToken, "chat.postMessage", { channel, text });
    return { ts: json.ts, channel: json.channel };
  }

  async oauthV2Access(clientId: string, clientSecret: string, code: string, redirectUri: string): Promise<SlackOAuthAccessResponse> {
    const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri });
    let response: Response;
    try {
      response = await fetch(`${SLACK_API_BASE}/oauth.v2.access`, { method: "POST", body });
    } catch (err) {
      throw new SlackRawApiError(0, err instanceof Error ? err.message : "Network error calling Slack.");
    }
    const json = (await response.json().catch(() => ({ ok: false }))) as SlackOAuthAccessResponse;
    if (!response.ok || !json.ok) {
      throw new SlackRawApiError(response.status, json.error ?? `Slack OAuth error (${response.status})`);
    }
    return json;
  }

  private async call<T>(botToken: string, method: string, params?: Record<string, string>): Promise<T> {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    let response: Response;
    try {
      response = await fetch(`${SLACK_API_BASE}/${method}${query}`, {
        headers: { Authorization: `Bearer ${botToken}` },
      });
    } catch (err) {
      throw new SlackRawApiError(0, err instanceof Error ? err.message : "Network error calling Slack.");
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("Retry-After");
      throw new SlackRawApiError(429, "ratelimited", retryAfterHeader ? Number(retryAfterHeader) : undefined);
    }
    if (!response.ok) {
      throw new SlackRawApiError(response.status, `Slack API error (${response.status})`);
    }

    // Slack's own quirk (docs/CONNECTOR_SDK.md Section 15 requires a
    // standardized taxonomy regardless of provider shape): API-level
    // failures come back as HTTP 200 with `{ ok: false, error: "..." }`,
    // not a non-2xx status - handled here, not left for callers to notice.
    const json = (await response.json().catch(() => ({ ok: false, error: "invalid_json" }))) as { ok: boolean; error?: string } & T;
    if (!json.ok) {
      throw new SlackRawApiError(200, json.error ?? "unknown_error");
    }
    return json;
  }
}
