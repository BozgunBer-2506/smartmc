/**
 * Shared HTTP-native optimistic concurrency primitives (docs/API.md
 * Section 8, ROADMAP.md Phase 20.4) - `ETag`/`If-Match`/`If-None-Match`
 * for resources backed by a `version` int column (docs/DATABASE.md
 * Section 9's optimistic-locking pattern), replacing the old
 * request-body-only `version` field a prior phase disclosed as a gap.
 *
 * Real concurrency, not just header plumbing: a mutating request's
 * `If-Match` is compared against the row's *current* version inside the
 * same atomic `updateMany({ where: { id, version } })` the write itself
 * uses - never against a version the server re-fetched moments earlier in
 * the same request (that only guards the microseconds between fetch and
 * write, not the real "someone else edited this since I loaded the form"
 * case an HTTP client's `If-Match` exists to catch).
 */
export function etagFor(version: number | string): string {
  return `"${version}"`;
}

/** Strips the required quoting; a header with no quotes is accepted too (some clients send bare values). */
export function parseETagHeader(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.replace(/^W\//, "").replace(/^"|"$/g, "");
}
