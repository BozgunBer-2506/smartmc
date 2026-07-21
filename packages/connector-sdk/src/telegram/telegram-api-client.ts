import type { TelegramMessage, TelegramUpdate, TelegramUser, TelegramWebhookInfo } from "./telegram.types";

/** A Telegram API call failed - carries the raw error_code/description/retry_after so mapError() can classify it. */
export class TelegramRawApiError extends Error {
  constructor(
    readonly errorCode: number,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "TelegramRawApiError";
  }
}

/**
 * The Telegram Bot API surface this connector needs. Injected into
 * TelegramConnector so certification/tests can substitute a fake
 * implementation without a real bot token or network access - the same
 * pattern the mock connector doesn't need (it has no real backing API),
 * but a real connector does.
 */
export interface TelegramApiClient {
  getMe(token: string): Promise<TelegramUser>;
  sendMessage(token: string, chatId: string, text: string): Promise<TelegramMessage>;
  setWebhook(token: string, url: string, secretToken: string): Promise<void>;
  deleteWebhook(token: string): Promise<void>;
  getWebhookInfo(token: string): Promise<TelegramWebhookInfo>;
  getUpdates(token: string, offset?: number, timeoutSeconds?: number): Promise<TelegramUpdate[]>;
}

interface RawSuccess<T> {
  ok: true;
  result: T;
}
interface RawFailure {
  ok: false;
  error_code: number;
  description: string;
  parameters?: { retry_after?: number };
}

const TELEGRAM_API_BASE = "https://api.telegram.org";

/** The real implementation - actual HTTP calls to api.telegram.org via the global fetch (Node 20+). */
export class RealTelegramApiClient implements TelegramApiClient {
  async getMe(token: string): Promise<TelegramUser> {
    return this.call<TelegramUser>(token, "getMe");
  }

  async sendMessage(token: string, chatId: string, text: string): Promise<TelegramMessage> {
    return this.call<TelegramMessage>(token, "sendMessage", { chat_id: chatId, text });
  }

  async setWebhook(token: string, url: string, secretToken: string): Promise<void> {
    await this.call<boolean>(token, "setWebhook", { url, secret_token: secretToken });
  }

  async deleteWebhook(token: string): Promise<void> {
    await this.call<boolean>(token, "deleteWebhook", {});
  }

  async getWebhookInfo(token: string): Promise<TelegramWebhookInfo> {
    return this.call<TelegramWebhookInfo>(token, "getWebhookInfo");
  }

  async getUpdates(token: string, offset?: number, timeoutSeconds = 0): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>(token, "getUpdates", {
      offset,
      timeout: timeoutSeconds,
      allowed_updates: ["message", "edited_message"],
    });
  }

  private async call<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
    } catch (err) {
      throw new TelegramRawApiError(0, err instanceof Error ? err.message : "Network error calling Telegram.");
    }

    const json = (await response.json()) as RawSuccess<T> | RawFailure;
    if (!json.ok) {
      throw new TelegramRawApiError(json.error_code, json.description, json.parameters?.retry_after);
    }
    return json.result;
  }
}
