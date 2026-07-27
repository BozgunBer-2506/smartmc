/**
 * Email connector config, matching this codebase's existing
 * env-with-documented-defaults pattern (telegram.config.ts,
 * discord.config.ts, slack.config.ts). Unlike those three, Email's
 * `credential_entry` auth method (`CONNECTOR_SDK.md` Section 3.1) needs
 * no platform-wide app registration (no client id/secret/signing
 * secret) - each user supplies their own IMAP/SMTP host/credentials
 * directly, the same as Telegram's `bot_token_entry`. The only genuine
 * platform-level setting is how often the poll runs, since `"polling"`
 * ingestion (Section 4.2) has no webhook to fall back on.
 */
export const emailConfig = {
  pollIntervalMs: () => Number(process.env.EMAIL_POLL_INTERVAL_MS ?? 2 * 60 * 1000),
};
