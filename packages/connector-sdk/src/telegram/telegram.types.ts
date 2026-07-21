/**
 * The subset of Telegram Bot API types this connector actually uses.
 * https://core.telegram.org/bots/api - not a full SDK, just what
 * mapMessage/mapError/the API client need.
 */
export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number; // unix seconds
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: unknown[];
  video?: unknown;
  document?: unknown;
  voice?: unknown;
  sticker?: unknown;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
}

export interface TelegramApiError {
  ok: false;
  error_code: number;
  description: string;
  parameters?: { retry_after?: number };
}

export interface TelegramApiSuccess<T> {
  ok: true;
  result: T;
}

export type TelegramApiResponse<T> = TelegramApiSuccess<T> | TelegramApiError;
