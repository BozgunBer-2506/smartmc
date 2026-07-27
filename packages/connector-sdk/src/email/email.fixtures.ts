import type { ConnectorErrorCode } from "../errors";
import { EmailRawApiError } from "./email-api-client";

/**
 * EmailConnector's own test fixtures (docs/CONNECTOR_SDK.md Section 16
 * item 13) - fixed, deterministic raw email message/error payloads
 * sufficient for the certification suite to exercise mapMessage()/mapError()
 * without a live mailbox or network access.
 */
export const EMAIL_MESSAGE_FIXTURES: readonly unknown[] = [
  {
    uid: 101,
    folder: "INBOX",
    messageId: "<msg-1@fixture.test>",
    references: [],
    from: { address: "ada@fixture.test", name: "Ada Lovelace" },
    subject: "Hello from a fixed email fixture",
    date: "2025-01-01T00:00:00.000Z",
    textBody: "Hello from a fixed email fixture.",
    isOwnMessage: false,
  },
  {
    uid: 102,
    folder: "INBOX",
    messageId: "<msg-2@fixture.test>",
    inReplyTo: "<msg-1@fixture.test>",
    references: ["<msg-1@fixture.test>"],
    from: { address: "grace@fixture.test", name: "Grace Hopper" },
    subject: "Re: Hello from a fixed email fixture",
    date: "2025-01-01T00:05:00.000Z",
    textBody: "",
    isOwnMessage: false,
  },
];

export const EMAIL_ERROR_FIXTURES: readonly { raw: unknown; expectedCode: ConnectorErrorCode; secretInMessage?: string }[] = [
  { raw: new EmailRawApiError("auth", "Invalid credentials"), expectedCode: "AUTH_EXPIRED" },
  { raw: new EmailRawApiError("rate_limited", "421 Too many connections"), expectedCode: "RATE_LIMITED" },
  { raw: new EmailRawApiError("connection", "ECONNREFUSED"), expectedCode: "PROVIDER_UNAVAILABLE" },
  { raw: new EmailRawApiError("not_found", "No such mailbox"), expectedCode: "RESOURCE_NOT_FOUND" },
  { raw: new EmailRawApiError("rejected", "550 Mailbox unavailable"), expectedCode: "PAYLOAD_REJECTED" },
  { raw: new EmailRawApiError("unknown", "Something unexpected"), expectedCode: "UNKNOWN" },
  {
    raw: new EmailRawApiError("auth", "Login failed for password: FAKE-fixture-password-never-a-real-credential"),
    expectedCode: "AUTH_EXPIRED",
    secretInMessage: "FAKE-fixture-password-never-a-real-credential",
  },
];
