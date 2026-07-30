/**
 * Slack connector config, matching this codebase's existing
 * env-with-documented-defaults pattern (auth.config.ts, telegram.config.ts,
 * discord.config.ts). `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET`/
 * `SLACK_SIGNING_SECRET` are app-wide platform operator config (one Slack
 * App registered once in api.slack.com/apps); unlike Discord's shared bot
 * token, each workspace that installs the app gets its own distinct bot
 * token via the OAuth v2 code exchange, stored per-LinkedAccount.
 */
export const slackConfig = {
  clientId: () => process.env.SLACK_CLIENT_ID ?? "",
  clientSecret: () => process.env.SLACK_CLIENT_SECRET ?? "",
  /** Verifies the Events API webhook is really from Slack (HMAC-SHA256 over the request body, docs/SECURITY.md's authenticity requirement). */
  signingSecret: () => process.env.SLACK_SIGNING_SECRET ?? "",
  /** The API's own public base URL, used to build the OAuth2 redirect_uri Slack calls back to. */
  publicBaseUrl: () => process.env.SLACK_PUBLIC_BASE_URL || undefined,
  /** Where to send the user's browser after a successful/failed connect. */
  webAppBaseUrl: () => process.env.SLACK_WEB_APP_BASE_URL ?? "http://localhost:3000",
  /**
   * Bot scopes requested during install - chat:write to send,
   * channels:history/groups:history to read messages, channels:read/
   * groups:read to list conversations. RealSlackApiClient.listConversations
   * calls conversations.list with types "public_channel,private_channel" -
   * groups:read is required for the private_channel half of that same
   * call, not just an unrelated nice-to-have scope.
   */
  botScopes: () => process.env.SLACK_BOT_SCOPES ?? "chat:write,channels:history,groups:history,channels:read,groups:read",
  reconciliationIntervalMs: () => Number(process.env.SLACK_RECONCILIATION_INTERVAL_MS ?? 15 * 60 * 1000),
};
