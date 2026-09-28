import type { ConversationMessage, ConversationSummary } from "./api";

/**
 * Non-destructive merge of a freshly-fetched conversations PAGE 1 into the
 * currently displayed (possibly paginated-beyond-page-1 via "Load more")
 * list - used when a realtime event nudges the conversation list, so
 * already-loaded older pages are never discarded (Inbox.tsx's socket
 * `onMessage` handler).
 *
 * The list is rendered in raw backend order with no client-side sort, so
 * that order is a real correctness contract, not cosmetic - `freshPage`
 * IS the backend's current canonical top-N (priorityScore desc,
 * lastMessageAt desc, id desc), so it is placed first, in that exact
 * order (whether an item is brand new or was already loaded - its fields
 * are refreshed either way). Anything previously loaded that isn't in
 * this fresh top-N is kept, appended after, in its prior relative order -
 * it is still correctly known to rank below everything in `freshPage`,
 * even though its exact position relative to other remainder items isn't
 * recomputed. This avoids inventing a client-side sort comparator: the
 * only ordering used is the server's own, for whichever slice of the
 * list it was just asked for.
 *
 * Disclosed limitation, not fixed by this function: an item that both
 * (a) was NOT in the previous page-1 fetch and (b) rises just enough to
 * rank ABOVE a previously loaded page's cursor boundary but NOT high
 * enough to be in the current top-N, will not appear until the next full
 * fresh load (mount, filter change, or the item rising further) - a
 * bounded, self-correcting gap inherent to keyset pagination under
 * concurrent mutation, not something a smarter merge can close without
 * re-fetching the entire accumulated list on every realtime event.
 */
export function mergeFreshConversationsPage(prev: ConversationSummary[], freshPage: ConversationSummary[]): ConversationSummary[] {
  const freshIds = new Set(freshPage.map((c) => c.id));
  const remainder = prev.filter((c) => !freshIds.has(c.id));
  return [...freshPage, ...remainder];
}

/** Appends a "Load more" conversations page after the currently loaded ones, deduplicated by ID. */
export function appendConversationsPage(prev: ConversationSummary[], nextPage: ConversationSummary[]): ConversationSummary[] {
  const existingIds = new Set(prev.map((c) => c.id));
  return [...prev, ...nextPage.filter((c) => !existingIds.has(c.id))];
}

/**
 * Appends a freshly-fetched newest-messages page (a realtime nudge, or the
 * page refetched right after sending a reply) to the end of the currently
 * displayed messages, deduplicated. `freshPage` is already
 * chronological-ascending (apps/web/lib/api.ts's `fetchMessages` always
 * returns oldest-first, matching the backend's own response contract), so
 * appending at the end is correct without re-sorting.
 */
export function mergeNewestMessagesPage(prev: ConversationMessage[], freshPage: ConversationMessage[]): ConversationMessage[] {
  const existingIds = new Set(prev.map((m) => m.id));
  return [...prev, ...freshPage.filter((m) => !existingIds.has(m.id))];
}

/**
 * Prepends an older-messages page ("Load older messages"), deduplicated.
 * `olderPage` is already chronological-ascending, so it belongs before
 * the currently loaded messages, not after.
 */
export function mergeOlderMessagesPage(olderPage: ConversationMessage[], prev: ConversationMessage[]): ConversationMessage[] {
  const existingIds = new Set(prev.map((m) => m.id));
  return [...olderPage.filter((m) => !existingIds.has(m.id)), ...prev];
}
