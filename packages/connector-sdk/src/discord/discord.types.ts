/**
 * The subset of the Discord API (REST + Gateway v10) this connector
 * actually uses. https://discord.com/developers/docs - not a full SDK.
 */
export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  bot?: boolean;
}

export interface DiscordAttachment {
  id: string;
  filename: string;
  content_type?: string;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  guild_id?: string;
  author: DiscordUser;
  content: string;
  timestamp: string; // ISO 8601
  attachments?: DiscordAttachment[];
}

export interface DiscordChannel {
  id: string;
  guild_id?: string;
  name?: string;
  type: number; // 0 = GUILD_TEXT
}

export interface DiscordGuild {
  id: string;
  name: string;
}

export interface DiscordApiErrorBody {
  code: number;
  message: string;
  retry_after?: number;
}

/** Gateway v10 opcodes (https://discord.com/developers/docs/topics/opcodes-and-status-codes). */
export const GatewayOpcode = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
} as const;

export interface GatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}
