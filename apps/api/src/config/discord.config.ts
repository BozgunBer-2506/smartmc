/**
 * Discord connector config, matching this codebase's existing
 * env-with-documented-defaults pattern (auth.config.ts, telegram.config.ts).
 * Unlike Telegram (one bot token per workspace, user-supplied), Discord
 * uses one app-wide bot registered once in the Discord Developer Portal -
 * `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`/`DISCORD_BOT_TOKEN` are
 * platform operator config, not something a user enters (ADR-0019).
 */
export const discordConfig = {
  clientId: () => process.env.DISCORD_CLIENT_ID ?? "",
  clientSecret: () => process.env.DISCORD_CLIENT_SECRET ?? "",
  botToken: () => process.env.DISCORD_BOT_TOKEN ?? "",
  /** The API's own public base URL, used to build the OAuth2 redirect_uri Discord calls back to. */
  publicBaseUrl: () => process.env.DISCORD_PUBLIC_BASE_URL || undefined,
  /** Where to send the user's browser after a successful/failed connect. */
  webAppBaseUrl: () => process.env.DISCORD_WEB_APP_BASE_URL ?? "http://localhost:3000",
  /** VIEW_CHANNEL (0x400) + SEND_MESSAGES (0x800) + READ_MESSAGE_HISTORY (0x10000) = 68608 by default. */
  botPermissions: () => process.env.DISCORD_BOT_PERMISSIONS ?? "68608",
  reconciliationIntervalMs: () => Number(process.env.DISCORD_RECONCILIATION_INTERVAL_MS ?? 15 * 60 * 1000),
};
