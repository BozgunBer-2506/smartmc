import type { ConnectorErrorCode } from "../errors";
import { TelegramRawApiError } from "./telegram-api-client";

/**
 * TelegramConnector's own test fixtures (docs/CONNECTOR_SDK.md Section 16
 * item 13) - fixed, deterministic raw Telegram Update/error payloads
 * sufficient for the certification suite to exercise mapMessage()/mapError()
 * without needing a live bot token or network access.
 */
export const TELEGRAM_MESSAGE_FIXTURES: readonly unknown[] = [
  {
    update_id: 100001,
    message: {
      message_id: 501,
      date: 1735689600, // 2025-01-01T00:00:00Z
      chat: { id: 987654321, type: "private", first_name: "Ada", username: "ada_lovelace" },
      from: { id: 987654321, is_bot: false, first_name: "Ada", last_name: "Lovelace", username: "ada_lovelace" },
      text: "Hello from a fixed Telegram fixture.",
    },
  },
  {
    update_id: 100002,
    message: {
      message_id: 502,
      date: 1735689660,
      chat: { id: -1001234567890, type: "supergroup", title: "SMC Test Group" },
      from: { id: 987654321, is_bot: false, first_name: "Ada", username: "ada_lovelace" },
      photo: [{ file_id: "abc" }],
    },
  },
];

export const TELEGRAM_ERROR_FIXTURES: readonly { raw: unknown; expectedCode: ConnectorErrorCode; secretInMessage?: string }[] = [
  { raw: new TelegramRawApiError(401, "Unauthorized"), expectedCode: "AUTH_EXPIRED" },
  { raw: new TelegramRawApiError(429, "Too Many Requests", 30), expectedCode: "RATE_LIMITED" },
  { raw: new TelegramRawApiError(500, "Internal Server Error"), expectedCode: "PROVIDER_UNAVAILABLE" },
  { raw: new TelegramRawApiError(404, "chat not found"), expectedCode: "RESOURCE_NOT_FOUND" },
  { raw: new TelegramRawApiError(403, "bot was blocked by the user"), expectedCode: "PERMISSION_DENIED" },
  { raw: new TelegramRawApiError(400, "message text is too long"), expectedCode: "PAYLOAD_REJECTED" },
  { raw: new TelegramRawApiError(418, "I'm a teapot"), expectedCode: "UNKNOWN" },
  {
    raw: new TelegramRawApiError(401, "Failed using token: 000000000:FAKE-fixture-token-never-a-real-credential"),
    expectedCode: "AUTH_EXPIRED",
    secretInMessage: "000000000:FAKE-fixture-token-never-a-real-credential",
  },
];
