import type { DiscordChannel, DiscordGuild, DiscordMessage, DiscordUser } from "./discord.types";

const DISCORD_API_BASE = "https://discord.com/api/v10";

/** A Discord REST API call failed - carries the raw code/message/retry_after so mapError() can classify it. */
export class DiscordRawApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "DiscordRawApiError";
  }
}

/**
 * The Discord REST API surface this connector needs. Injected into
 * DiscordConnector so certification/tests can substitute a fake
 * implementation without a real bot token or network access - the same
 * dependency-injection pattern TelegramConnector uses.
 */
export interface DiscordApiClient {
  getMe(botToken: string): Promise<DiscordUser>;
  getGuild(botToken: string, guildId: string): Promise<DiscordGuild>;
  listGuildChannels(botToken: string, guildId: string): Promise<DiscordChannel[]>;
  listChannelMessages(botToken: string, channelId: string, before?: string, limit?: number): Promise<DiscordMessage[]>;
  sendMessage(botToken: string, channelId: string, content: string): Promise<DiscordMessage>;
}

export class RealDiscordApiClient implements DiscordApiClient {
  async getMe(botToken: string): Promise<DiscordUser> {
    return this.call<DiscordUser>(botToken, "GET", "/users/@me");
  }

  async getGuild(botToken: string, guildId: string): Promise<DiscordGuild> {
    return this.call<DiscordGuild>(botToken, "GET", `/guilds/${guildId}`);
  }

  async listGuildChannels(botToken: string, guildId: string): Promise<DiscordChannel[]> {
    return this.call<DiscordChannel[]>(botToken, "GET", `/guilds/${guildId}/channels`);
  }

  async listChannelMessages(botToken: string, channelId: string, before?: string, limit = 50): Promise<DiscordMessage[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (before) query.set("before", before);
    return this.call<DiscordMessage[]>(botToken, "GET", `/channels/${channelId}/messages?${query.toString()}`);
  }

  async sendMessage(botToken: string, channelId: string, content: string): Promise<DiscordMessage> {
    return this.call<DiscordMessage>(botToken, "POST", `/channels/${channelId}/messages`, { content });
  }

  private async call<T>(botToken: string, method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${DISCORD_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new DiscordRawApiError(0, err instanceof Error ? err.message : "Network error calling Discord.");
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const message = typeof json.message === "string" ? json.message : `Discord API error (${response.status})`;
      const retryAfter = typeof json.retry_after === "number" ? json.retry_after : undefined;
      throw new DiscordRawApiError(response.status, message, retryAfter);
    }
    return json as T;
  }
}
