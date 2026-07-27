import type { ConnectorErrorCode } from "../errors";
import { SlackRawApiError } from "./slack-api-client";

/**
 * SlackConnector's own test fixtures (docs/CONNECTOR_SDK.md Section 16
 * item 13) - fixed, deterministic raw Slack message/error payloads
 * sufficient for the certification suite to exercise mapMessage()/mapError()
 * without a live bot token or network access.
 */
export const SLACK_MESSAGE_FIXTURES: readonly unknown[] = [
  {
    type: "message",
    channel: "C0000000001",
    user: "U0000000001",
    text: "Hello from a fixed Slack fixture.",
    ts: "1735689600.000100",
    team: "T0000000001",
  },
  {
    type: "message",
    subtype: "file_share",
    channel: "C0000000001",
    user: "U0000000002",
    text: "",
    ts: "1735689900.000200",
    team: "T0000000001",
  },
];

export const SLACK_ERROR_FIXTURES: readonly { raw: unknown; expectedCode: ConnectorErrorCode; secretInMessage?: string }[] = [
  { raw: new SlackRawApiError(200, "invalid_auth"), expectedCode: "AUTH_EXPIRED" },
  { raw: new SlackRawApiError(429, "ratelimited", 5), expectedCode: "RATE_LIMITED" },
  { raw: new SlackRawApiError(500, "internal_error"), expectedCode: "PROVIDER_UNAVAILABLE" },
  { raw: new SlackRawApiError(200, "channel_not_found"), expectedCode: "RESOURCE_NOT_FOUND" },
  { raw: new SlackRawApiError(200, "missing_scope"), expectedCode: "PERMISSION_DENIED" },
  { raw: new SlackRawApiError(200, "msg_too_long"), expectedCode: "PAYLOAD_REJECTED" },
  { raw: new SlackRawApiError(200, "something_unmapped"), expectedCode: "UNKNOWN" },
  {
    raw: new SlackRawApiError(200, "Failed using token: FAKE.slack-fixture-token.never-a-real-credential"),
    expectedCode: "UNKNOWN",
    secretInMessage: "FAKE.slack-fixture-token.never-a-real-credential",
  },
];
