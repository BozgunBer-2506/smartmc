/**
 * Isolated logic verification for apps/web/lib/inbox-pagination.ts's pure
 * merge/dedup helpers (Inbox pagination task) - the same "no browser-
 * automation tool exists in this project" reasoning as
 * verify-token-refresh-logic.ts applies here: these are exercised
 * Node-side, directly against the real compiled module, not
 * reimplemented. Run via ts-node (apps/api's existing devDependency).
 */
import {
  appendConversationsPage,
  mergeFreshConversationsPage,
  mergeNewestMessagesPage,
  mergeOlderMessagesPage,
} from "../apps/web/lib/inbox-pagination";
import type { ConversationMessage, ConversationSummary } from "../apps/web/lib/api";

let passCount = 0;
let failCount = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passCount += 1;
  } else {
    console.error(`FAIL: ${label}`);
    failCount += 1;
  }
}

function conversation(id: string, overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id,
    title: `Conversation ${id}`,
    providerKey: "mock",
    lastMessageAt: new Date().toISOString(),
    priorityScore: 0,
    isArchived: false,
    category: null,
    unread: false,
    lastMessage: null,
    ...overrides,
  };
}

function message(id: string, overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return { id, direction: "inbound", bodyText: `Message ${id}`, receivedAt: new Date().toISOString(), sender: null, ...overrides };
}

function main() {
  // --- appendConversationsPage ("Load more") ---
  {
    const page1 = [conversation("a"), conversation("b")];
    const page2 = [conversation("c"), conversation("d")];
    const result = appendConversationsPage(page1, page2);
    check("appendConversationsPage: page 2 appended after page 1, order preserved", result.map((c) => c.id).join(",") === "a,b,c,d");
  }
  {
    const page1 = [conversation("a"), conversation("b")];
    const overlapping = [conversation("b"), conversation("c")]; // "b" re-appears (e.g. a realtime update landed between fetches)
    const result = appendConversationsPage(page1, overlapping);
    check("appendConversationsPage: deduplicates by ID, keeps first occurrence's position", result.map((c) => c.id).join(",") === "a,b,c");
    check("appendConversationsPage: no ID appears twice", new Set(result.map((c) => c.id)).size === result.length);
  }
  {
    const result = appendConversationsPage([conversation("a")], []);
    check("appendConversationsPage: an empty next page (hasMore=false case) changes nothing", result.map((c) => c.id).join(",") === "a");
  }

  // --- mergeFreshConversationsPage (realtime nudge) ---
  {
    const prev = [conversation("a", { priorityScore: 1 }), conversation("b", { priorityScore: 2 })];
    const fresh = [conversation("b", { priorityScore: 99 }), conversation("a", { priorityScore: 1 })]; // "b" just overtook "a" in canonical server order
    const result = mergeFreshConversationsPage(prev, fresh);
    check("mergeFreshConversationsPage: an existing item's fields update", result.find((c) => c.id === "b")?.priorityScore === 99);
    check(
      "mergeFreshConversationsPage: fresh page-1 order WINS - a conversation that overtook another in canonical order now displays in that new order, not its old position",
      result.map((c) => c.id).join(",") === "b,a",
    );
  }
  {
    const prev = [conversation("a")];
    const fresh = [conversation("z"), conversation("a")]; // "z" is a brand-new conversation, ranks above "a" server-side
    const result = mergeFreshConversationsPage(prev, fresh);
    check("mergeFreshConversationsPage: fresh page-1's own order is preserved verbatim at the front", result.map((c) => c.id).join(",") === "z,a");
    check("mergeFreshConversationsPage: no duplicate IDs after merge", new Set(result.map((c) => c.id)).size === result.length);
  }
  {
    const prev = [conversation("a"), conversation("b"), conversation("c")]; // "c" was loaded via a prior "Load more"
    const fresh = [conversation("a"), conversation("b")]; // page 1 no longer reaches "c"
    const result = mergeFreshConversationsPage(prev, fresh);
    check(
      "mergeFreshConversationsPage: a conversation only reachable via a prior 'Load more' page survives a realtime page-1 refresh",
      result.some((c) => c.id === "c"),
    );
    check(
      "mergeFreshConversationsPage: fresh page-1 items come before the surviving remainder, remainder keeps its relative order",
      result.map((c) => c.id).join(",") === "a,b,c",
    );
  }
  {
    // A conversation promoted into the fresh top-N from beyond it (e.g. it
    // was previously only reachable via "Load more") must move to its new
    // canonical position, not stay stranded at its old tail position, and
    // must not appear twice.
    const prev = [conversation("a"), conversation("b"), conversation("promoted")];
    const fresh = [conversation("promoted"), conversation("a"), conversation("b")]; // "promoted" now outranks everything
    const result = mergeFreshConversationsPage(prev, fresh);
    check("mergeFreshConversationsPage: a conversation promoted into the fresh top-N moves to its new canonical position", result[0]?.id === "promoted");
    check("mergeFreshConversationsPage: the promoted conversation appears exactly once", result.filter((c) => c.id === "promoted").length === 1);
  }

  // --- Overlapping realtime merge + "Load more" (combined scenario) ---
  {
    // 1. Page 1 loaded, then "Load more" loaded page 2.
    let state = appendConversationsPage([conversation("a"), conversation("b")], [conversation("c"), conversation("d")]);
    // 2. A realtime event nudges page 1 again - "b" and "c" (from different
    //    original pages) both happen to be in the fresh top-N this time.
    const freshFromRealtime = [conversation("c"), conversation("a")];
    state = mergeFreshConversationsPage(state, freshFromRealtime);
    check(
      "combined: a realtime merge over an already load-more'd list stays fully deduplicated",
      new Set(state.map((c) => c.id)).size === state.length,
    );
    check("combined: no conversation lost across the realtime+load-more sequence", ["a", "b", "c", "d"].every((id) => state.some((c) => c.id === id)));
    check("combined: fresh realtime order wins at the front", state.slice(0, 2).map((c) => c.id).join(",") === "c,a");
  }

  // --- mergeNewestMessagesPage (realtime nudge / post-send refresh) ---
  {
    const prev = [message("1"), message("2")];
    const fresh = [message("2"), message("3")]; // "2" already known, "3" is new
    const result = mergeNewestMessagesPage(prev, fresh);
    check("mergeNewestMessagesPage: new message appended at the end", result.map((m) => m.id).join(",") === "1,2,3");
    check("mergeNewestMessagesPage: no duplicate IDs", new Set(result.map((m) => m.id)).size === result.length);
  }
  {
    const prev = [message("older-1"), message("1"), message("2")]; // "older-1" came from a prior "Load older messages"
    const fresh = [message("1"), message("2")]; // page 1 never reaches back to "older-1"
    const result = mergeNewestMessagesPage(prev, fresh);
    check("mergeNewestMessagesPage: previously loaded older history survives a realtime page-1 refresh", result[0]?.id === "older-1");
  }

  // --- mergeOlderMessagesPage ("Load older messages") ---
  {
    const current = [message("5"), message("6")]; // currently displayed, oldest-first
    const older = [message("3"), message("4")]; // an older page, also oldest-first internally
    const result = mergeOlderMessagesPage(older, current);
    check("mergeOlderMessagesPage: older page is PREPENDED, chronological order preserved", result.map((m) => m.id).join(",") === "3,4,5,6");
  }
  {
    const current = [message("4"), message("5")];
    const older = [message("3"), message("4")]; // "4" overlaps the current page's own oldest message
    const result = mergeOlderMessagesPage(older, current);
    check("mergeOlderMessagesPage: deduplicates an overlapping boundary message", result.map((m) => m.id).join(",") === "3,4,5");
    check("mergeOlderMessagesPage: no duplicate IDs", new Set(result.map((m) => m.id)).size === result.length);
  }
  {
    const result = mergeOlderMessagesPage([], [message("5")]);
    check("mergeOlderMessagesPage: an empty older page (hasMore=false case) changes nothing", result.map((m) => m.id).join(",") === "5");
  }

  console.log(`\n${passCount} passed, ${failCount} failed.`);
  process.exit(failCount > 0 ? 1 : 0);
}

main();
