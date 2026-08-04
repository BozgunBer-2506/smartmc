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

export type SortDirection = "asc" | "desc";

/**
 * `?sortBy=`/`?order=` support (docs/API.md's allowlist-per-resource
 * convention, ROADMAP.md Phase 20.3). `allowed` is each resource's own
 * fixed whitelist, never an arbitrary client-supplied column name - a
 * request can't force a sort on a column that isn't indexed for it, and
 * can't probe for the existence of columns that were never meant to be
 * sortable. An unrecognized value falls back to `fallback` rather than
 * 400ing, matching `decodeCursor`'s "a stale/bad param shouldn't break a
 * client" stance.
 */
export function parseSortBy<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export function parseOrder(raw: string | undefined, fallback: SortDirection): SortDirection {
  return raw === "asc" || raw === "desc" ? raw : fallback;
}

/**
 * A single-field keyset WHERE clause: rows strictly past the cursor's own
 * `(value, id)` position on `sortField`, direction-aware. This is what
 * keeps an explicit `?sortBy=` in step with its own cursor (a `desc`
 * cursor page-walk can't silently become `asc` partway through, and a
 * cursor minted for one `sortField` can't be replayed against another) -
 * the cursor payload itself carries `sortBy`/`order`, so a page walk stays
 * self-consistent even if the client's query params drift or are omitted
 * on later requests. `value` must already be the correctly-typed Prisma
 * filter value (e.g. a `Date` for a DateTime column, not its ISO string).
 */
export function keysetOr(sortField: string, order: SortDirection, value: unknown, id: string): Record<string, unknown> {
  const cmp = order === "desc" ? "lt" : "gt";
  return {
    OR: [{ [sortField]: { [cmp]: value } }, { AND: [{ [sortField]: value }, { id: { [cmp]: id } }] }],
  };
}
