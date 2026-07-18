/**
 * The standardized, provider-agnostic error taxonomy (docs/CONNECTOR_SDK.md
 * Section 15). Every connector maps its own provider-specific failures into
 * one of these codes before the error reaches the rest of the platform -
 * core platform code never branches on provider-specific error shapes.
 */
export type ConnectorErrorCode =
  | "AUTH_EXPIRED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "RESOURCE_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "PAYLOAD_REJECTED"
  | "UNKNOWN";

const RETRYABLE_CODES: ReadonlySet<ConnectorErrorCode> = new Set(["RATE_LIMITED", "PROVIDER_UNAVAILABLE"]);

/**
 * Patterns matched for mandatory credential redaction (docs/CONNECTOR_SDK.md
 * Section 15: "Credential redaction is mandatory in every error payload and
 * log line a connector produces"). Matches `key: value` / `key=value`
 * pairs where the key looks credential-shaped, case-insensitively.
 */
const CREDENTIAL_PATTERN = /\b((?:api[_-]?key|token|password|secret|bearer)\s*[:=]\s*)(\S+)/gi;

export function redactCredentials(input: string): string {
  return input.replace(CREDENTIAL_PATTERN, (_match, prefix: string) => `${prefix}[REDACTED]`);
}

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly retryable: boolean;

  constructor(code: ConnectorErrorCode, message: string) {
    super(redactCredentials(message));
    this.name = "ConnectorError";
    this.code = code;
    this.retryable = RETRYABLE_CODES.has(code);
  }
}
