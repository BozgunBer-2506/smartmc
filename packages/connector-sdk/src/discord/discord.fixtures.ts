import type { ConnectorErrorCode } from "../errors";
import { DiscordRawApiError } from "./discord-api-client";

/**
 * DiscordConnector's own test fixtures (docs/CONNECTOR_SDK.md Section 16
 * item 13) - fixed, deterministic raw Discord message/error payloads
 * sufficient for the certification suite to exercise mapMessage()/mapError()
 * without a live bot token or network access.
 */
export const DISCORD_MESSAGE_FIXTURES: readonly unknown[] = [
  {
    id: "1100000000000000001",
    channel_id: "900000000000000001",
    guild_id: "800000000000000001",
    author: { id: "700000000000000001", username: "ada", global_name: "Ada Lovelace", bot: false },
    content: "Hello from a fixed Discord fixture.",
    timestamp: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "1100000000000000002",
    channel_id: "900000000000000001",
    guild_id: "800000000000000001",
    author: { id: "700000000000000002", username: "grace", bot: false },
    content: "",
    timestamp: "2025-01-01T00:05:00.000Z",
    attachments: [{ id: "a1", filename: "photo.png", content_type: "image/png" }],
  },
];

export const DISCORD_ERROR_FIXTURES: readonly { raw: unknown; expectedCode: ConnectorErrorCode; secretInMessage?: string }[] = [
  { raw: new DiscordRawApiError(401, "401: Unauthorized"), expectedCode: "AUTH_EXPIRED" },
  { raw: new DiscordRawApiError(429, "You are being rate limited.", 5), expectedCode: "RATE_LIMITED" },
  { raw: new DiscordRawApiError(500, "Internal Server Error"), expectedCode: "PROVIDER_UNAVAILABLE" },
  { raw: new DiscordRawApiError(404, "Unknown Channel"), expectedCode: "RESOURCE_NOT_FOUND" },
  { raw: new DiscordRawApiError(403, "Missing Permissions"), expectedCode: "PERMISSION_DENIED" },
  { raw: new DiscordRawApiError(400, "Cannot send an empty message"), expectedCode: "PAYLOAD_REJECTED" },
  { raw: new DiscordRawApiError(418, "I'm a teapot"), expectedCode: "UNKNOWN" },
  {
    raw: new DiscordRawApiError(401, "Failed using token: FAKE.discord-fixture-token.never-a-real-credential"),
    expectedCode: "AUTH_EXPIRED",
    secretInMessage: "FAKE.discord-fixture-token.never-a-real-credential",
  },
];
