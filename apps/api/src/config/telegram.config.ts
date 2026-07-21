/**
 * Telegram connector config, matching this codebase's existing
 * env-with-documented-defaults pattern (auth.config.ts, credentials-store.config.ts).
 */
export const telegramConfig = {
  /**
   * The public HTTPS base URL Telegram should POST webhooks to
   * (`{base}/v1/connectors/telegram/webhook/{linkedAccountId}`). Unset in
   * local dev, where there is no public endpoint - a LinkedAccount
   * connected without it works in reconciliation-only mode (ADR-0017's
   * getUpdates drain) until a real deployment sets this.
   */
  webhookBaseUrl(): string | undefined {
    return process.env.TELEGRAM_WEBHOOK_BASE_URL || undefined;
  },
  reconciliationIntervalMs(): number {
    return Number(process.env.TELEGRAM_RECONCILIATION_INTERVAL_MS ?? 5 * 60 * 1000);
  },
};
