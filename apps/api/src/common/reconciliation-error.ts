import { ConnectorError } from "@smc/connector-sdk";

/**
 * Every connector maps a provider auth failure (Telegram/Discord 401,
 * Slack invalid_auth/not_authed/token_revoked, IMAP/SMTP auth rejection)
 * to `ConnectorError.code === "AUTH_EXPIRED"` (packages/connector-sdk).
 * The lifecycle already defines `reauth_required` as a distinct state from
 * `degraded` for exactly this case (ADR-0018, CONNECTOR_SDK.md Section 2),
 * with its own UI label and its own send-path guard - but until this fix,
 * every reconciliation/poll service's catch block collapsed every failure
 * into `degraded`, so an expired credential sat there forever, silently
 * re-logging the same warning every cycle with no user-facing signal to
 * reconnect. One shared helper instead of four copies of the same branch,
 * used identically by Telegram/Discord/Slack/Email's reconciliation
 * services.
 */
export function statusForReconciliationFailure(err: unknown): "reauth_required" | "degraded" {
  return err instanceof ConnectorError && err.code === "AUTH_EXPIRED" ? "reauth_required" : "degraded";
}
