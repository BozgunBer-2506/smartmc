import type { ConnectorErrorCode } from "./errors";

/**
 * The Mock Connector's own test fixtures (docs/CONNECTOR_SDK.md Section 16
 * item 13: "ships with its own test fixtures ... sufficient for the
 * conformance suite to exercise its mapper without needing live provider
 * credentials"). Every other connector is expected to ship an equivalent
 * fixtures module for its own provider.
 */
export const MOCK_MESSAGE_FIXTURES: readonly unknown[] = [
  {
    id: "fixture-msg-1",
    conversationId: "fixture-conversation-1",
    conversationTitle: "Fixture Conversation",
    direction: "inbound",
    text: "Hello from a fixed fixture payload.",
    receivedAt: "2026-01-01T00:00:00.000Z",
    senderId: "fixture-sender-1",
    senderHandle: "@fixture-sender-1",
    senderName: "Fixture Sender",
  },
  {
    id: "fixture-msg-2",
    conversationId: "fixture-conversation-1",
    direction: "outbound",
    text: "A reply, sent from our side.",
    receivedAt: "2026-01-01T00:05:00.000Z",
  },
];

export const MOCK_ERROR_FIXTURES: readonly { raw: unknown; expectedCode: ConnectorErrorCode; secretInMessage?: string }[] = [
  {
    raw: { code: "auth_expired", message: "Bot token expired." },
    expectedCode: "AUTH_EXPIRED",
  },
  {
    raw: { code: "rate_limited", message: "Too many requests." },
    expectedCode: "RATE_LIMITED",
  },
  {
    raw: { code: "provider_down", message: "Upstream returned 503." },
    expectedCode: "PROVIDER_UNAVAILABLE",
  },
  {
    raw: { code: "not_found", message: "Conversation no longer exists." },
    expectedCode: "RESOURCE_NOT_FOUND",
  },
  {
    raw: { code: "forbidden", message: "Bot is not an admin in this channel." },
    expectedCode: "PERMISSION_DENIED",
  },
  {
    raw: { code: "rejected", message: "Message contains a banned word." },
    expectedCode: "PAYLOAD_REJECTED",
  },
  {
    raw: { code: "something_new", message: "An error type not yet mapped." },
    expectedCode: "UNKNOWN",
  },
  {
    raw: { code: "auth_expired", message: "Failed using token: mock-valid-super-secret-123" },
    expectedCode: "AUTH_EXPIRED",
    secretInMessage: "mock-valid-super-secret-123",
  },
];
