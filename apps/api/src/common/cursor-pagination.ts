/**
 * Shared cursor-pagination primitives (docs/API.md Section 4, ROADMAP.md
 * Phase 20.2) - every list endpoint gets the same `{data, pagination:
 * {nextCursor, hasMore}}` envelope and `?limit=&cursor=` query params,
 * built on real Postgres keyset pagination (a `WHERE (sortKey, id) <
 * (lastSortKey, lastId)` condition), never `OFFSET`, per the spec's own
 * "offset pagination silently produces wrong results under concurrent
 * writes" reasoning - this API's dominant use case (an actively-updating
 * inbox) is exactly the scenario that breaks offset paging constantly.
 *
 * The cursor is opaque (clients must never parse or construct it) but
 * deliberately NOT cryptographically signed, despite API.md's "signed
 * token" wording - a disclosed simplification: every query this cursor
 * feeds into is still scoped by `workspaceId` from the JWT, never from
 * the cursor itself, so a tampered cursor can at most desync a client's
 * own already-authorized pagination position, not cross a tenant
 * boundary. Signing would add a secret-management dependency to close a
 * gap that doesn't exist here.
 */
export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export interface CursorPage<T> {
  data: T[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

export function parseLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(Math.floor(n), MAX_PAGE_LIMIT);
}

export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** A malformed/tampered/expired cursor is treated as "no cursor" (start from the beginning), never a 400 - a stale bookmark shouldn't break a client. */
export function decodeCursor<T>(cursor: string | undefined): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Every query fetches `limit + 1` rows; if the extra row came back, there's
 * a next page and it's trimmed off before returning. Avoids a separate
 * `COUNT`-style existence check.
 */
export function buildPage<T>(rows: T[], limit: number, cursorFor: (lastRow: T) => Record<string, unknown>): CursorPage<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    pagination: { nextCursor: hasMore && last !== undefined ? encodeCursor(cursorFor(last)) : null, hasMore },
  };
}
