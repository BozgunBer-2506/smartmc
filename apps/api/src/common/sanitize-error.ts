/**
 * Normalizes a raw provider/connection error message before it's ever
 * shown to a client (docs/ROADMAP.md Phase 21.2) - `LinkedAccount.lastError`
 * is written verbatim by each connector's reconciliation service (a
 * pre-existing, out-of-scope-for-this-phase design), which is fine for an
 * operator reading server logs but not for `GET /v1/connectors`' response
 * body: a raw `Error#message` can echo a request URL's query string, an
 * IMAP server's greeting banner, or (worst case) a credential a provider
 * SDK included in its own error text.
 *
 * Deliberately conservative: truncates, strips anything token/URL-query-
 * shaped, and falls back to a generic category label rather than ever
 * risk passing through something sensitive unredacted.
 */
const MAX_LENGTH = 200;
/** Matches Telegram bot tokens (`123456:AA...`), Bearer headers, and generic long token-shaped runs - broad on purpose. */
const TOKEN_LIKE = /\b\d{6,}:[\w-]{20,}\b|Bearer\s+[\w.-]{10,}|\b[A-Za-z0-9_-]{25,}\b/g;
const URL_QUERY = /(\?[^\s"']+)/g;

export function sanitizeErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const redacted = raw
    .replace(URL_QUERY, "")
    .replace(TOKEN_LIKE, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!redacted) return "An error occurred - see server logs for detail.";
  return redacted.length > MAX_LENGTH ? `${redacted.slice(0, MAX_LENGTH)}…` : redacted;
}
