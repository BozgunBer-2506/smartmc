import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `inbox-pg-${randomBytes(6).toString("hex")}@example.com`;
const password = `Vf9${randomBytes(12).toString("hex")}Zq`;

let passCount = 0;
let failCount = 0;

function check(label, condition) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passCount += 1;
  } else {
    console.error(`FAIL: ${label}`);
    failCount += 1;
  }
}

async function getJson(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function sendMock(accessToken, { senderDisplayName, senderExternalId, bodyText, conversationExternalId }) {
  const res = await fetch(`${BASE}/dev/mock-connector/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ senderDisplayName, senderExternalId, bodyText, conversationExternalId }),
  });
  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls until `check()` returns true or `timeoutMs` elapses, instead of
 * guessing a fixed delay for the async BullMQ ingestion pipeline
 * (`/dev/mock-connector/send` returns `status: "queued"`, not a
 * synchronous confirmation - `apps/api/src/mock-connector/mock-connector.controller.ts`).
 * A fixed sleep proved to be a source of real, if infrequent, flakiness
 * right after a cold server start (the worker's own DB/Redis connection
 * warmup competes with the seeding loop for the same window) - polling
 * removes the guess entirely rather than just widening it.
 */
async function pollUntil(check, { timeoutMs = 10000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = false;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return true;
    await sleep(intervalMs);
  }
  return last;
}

/**
 * Live verification of the real HTTP contract the Inbox pagination
 * frontend work (apps/web/lib/api.ts's fetchConversations/fetchMessages,
 * apps/web/components/Inbox.tsx) depends on - GET /v1/conversations and
 * GET /v1/conversations/:id/messages's cursor pagination, exercised
 * end to end against the actual running API and Postgres, mirroring
 * verify-phase20.2-cursor-pagination.mjs's approach but against the
 * Inbox's own two paginated endpoints instead of /v1/rules.
 *
 * Covers: first page, cursor chaining, second-page append correctness,
 * no duplicate/skipped rows across a full walk, ordering, and
 * hasMore=false/nextCursor=null on the final page - for both
 * conversations (?sortBy=createdAt&order=asc, a deterministic order
 * independent of priority scoring) and messages within one conversation
 * (the backend's fixed receivedAt-desc-internally/chronological-
 * ascending-returned contract apps/web/lib/api.ts's fetchMessages relies
 * on). Does NOT exercise the frontend's React state/merge logic itself -
 * see scripts/verify-inbox-pagination-logic.ts for that, and the final
 * report's manual-verification notes for what only a real browser
 * click-through can confirm (race conditions, scroll-position
 * preservation, the "Load more"/"Load older messages" UI affordances).
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Inbox Pagination Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  // ---------------------------------------------------------------
  // A. Conversations pagination
  // ---------------------------------------------------------------
  const TOTAL_CONVERSATIONS = 25;
  const CONV_PAGE_LIMIT = 10;
  const createdSenderIds = [];
  for (let i = 0; i < TOTAL_CONVERSATIONS; i++) {
    const senderExternalId = `inbox-pg-conv-${i}`;
    createdSenderIds.push(senderExternalId);
    await sendMock(accessToken, {
      senderDisplayName: `Pagination Conversation ${i}`,
      senderExternalId,
      bodyText: `Seed message for conversation ${i}`,
    });
    await sleep(15); // keeps createdAt strictly increasing across the seeded conversations
  }
  // Poll instead of a fixed sleep - waits for the async ingestion
  // pipeline to actually catch up rather than guessing how long that takes.
  const conversationsIngested = await pollUntil(async () => {
    const { body } = await getJson(`${BASE}/v1/conversations?limit=1000`, accessToken);
    return (body.data ?? []).filter((c) => c.title?.startsWith("Pagination Conversation ")).length >= TOTAL_CONVERSATIONS;
  });
  check(`A. all ${TOTAL_CONVERSATIONS} seeded conversations were ingested before querying`, conversationsIngested);

  const seenConversationTitles = [];
  let convCursor;
  let convPageCount = 0;
  let convBrokenLimit = false;
  let convSawShortPage = false;
  do {
    const url = new URL(`${BASE}/v1/conversations`);
    url.searchParams.set("limit", String(CONV_PAGE_LIMIT));
    url.searchParams.set("sortBy", "createdAt");
    url.searchParams.set("order", "asc");
    if (convCursor) url.searchParams.set("cursor", convCursor);
    const { status, body } = await getJson(url.toString(), accessToken);
    if (status !== 200) {
      check(`conversations page ${convPageCount + 1} returns 200`, false);
      break;
    }
    if (body.data.length > CONV_PAGE_LIMIT) convBrokenLimit = true;
    if (body.data.length < CONV_PAGE_LIMIT) convSawShortPage = true;
    for (const c of body.data) seenConversationTitles.push(c.title);
    convCursor = body.pagination.nextCursor;
    convPageCount += 1;
    if (!body.pagination.hasMore) {
      check("A. the final conversations page reports hasMore: false", body.pagination.hasMore === false);
      check("A. the final conversations page has nextCursor: null", body.pagination.nextCursor === null);
      break;
    }
  } while (convCursor && convPageCount < 20);

  check("A. no conversations page exceeded the requested limit", !convBrokenLimit);
  check("A. conversation pagination spanned more than one page", convPageCount > 1);
  check("A. at least one conversations page came back short (the last one)", convSawShortPage);

  const seenTitleSet = new Set(seenConversationTitles);
  check("A. no duplicate conversation appeared across pages", seenTitleSet.size === seenConversationTitles.length);

  const expectedTitles = createdSenderIds.map((_, i) => `Pagination Conversation ${i}`);
  const recoveredCount = expectedTitles.filter((t) => seenTitleSet.has(t)).length;
  check(`A. every one of the ${TOTAL_CONVERSATIONS} seeded conversations was recovered exactly once`, recoveredCount === TOTAL_CONVERSATIONS);
  check(
    "A. ?sortBy=createdAt&order=asc returns conversations oldest-first, second page correctly continuing where the first left off",
    JSON.stringify(seenConversationTitles.filter((t) => expectedTitles.includes(t))) === JSON.stringify(expectedTitles),
  );

  // ---------------------------------------------------------------
  // B. Messages pagination (within a single conversation)
  // ---------------------------------------------------------------
  const TOTAL_MESSAGES = 25;
  const MSG_PAGE_LIMIT = 10;
  const conversationSenderId = "inbox-pg-messages-thread";
  for (let i = 0; i < TOTAL_MESSAGES; i++) {
    await sendMock(accessToken, {
      senderDisplayName: "Pagination Messages Thread",
      senderExternalId: conversationSenderId,
      conversationExternalId: conversationSenderId,
      bodyText: `msg-${i}`,
    });
    await sleep(15); // keeps receivedAt strictly increasing across the seeded messages
  }

  // Poll for the conversation itself first, then poll until all seeded
  // messages have actually been ingested into it - same reasoning as the
  // conversations section above.
  let messagesConversation;
  await pollUntil(async () => {
    const { body } = await getJson(`${BASE}/v1/conversations?limit=1000`, accessToken);
    messagesConversation = body.data.find((c) => c.title === "Pagination Messages Thread");
    return Boolean(messagesConversation);
  });
  check("B. the seeded messages conversation exists", Boolean(messagesConversation));
  const conversationId = messagesConversation?.id;

  if (conversationId) {
    const messagesIngested = await pollUntil(async () => {
      const { body } = await getJson(`${BASE}/v1/conversations/${conversationId}/messages?limit=1000`, accessToken);
      return (body.data ?? []).length >= TOTAL_MESSAGES;
    });
    check(`B. all ${TOTAL_MESSAGES} seeded messages were ingested before querying`, messagesIngested);
  }

  const seenBodies = [];
  const pageBodies = [];
  let msgCursor;
  let msgPageCount = 0;
  let msgBrokenLimit = false;
  let msgSawShortPage = false;
  if (conversationId) {
    do {
      const url = new URL(`${BASE}/v1/conversations/${conversationId}/messages`);
      url.searchParams.set("limit", String(MSG_PAGE_LIMIT));
      if (msgCursor) url.searchParams.set("cursor", msgCursor);
      const { status, body } = await getJson(url.toString(), accessToken);
      if (status !== 200) {
        check(`B. messages page ${msgPageCount + 1} returns 200`, false);
        break;
      }
      if (body.data.length > MSG_PAGE_LIMIT) msgBrokenLimit = true;
      if (body.data.length < MSG_PAGE_LIMIT) msgSawShortPage = true;
      const bodies = body.data.map((m) => m.bodyText);
      pageBodies.push(bodies);
      seenBodies.push(...bodies);
      msgCursor = body.pagination.nextCursor;
      msgPageCount += 1;
      if (!body.pagination.hasMore) {
        check("B. the final messages page reports hasMore: false", body.pagination.hasMore === false);
        check("B. the final messages page has nextCursor: null", body.pagination.nextCursor === null);
        break;
      }
    } while (msgCursor && msgPageCount < 20);
  }

  check("B. no messages page exceeded the requested limit", !msgBrokenLimit);
  check("B. message pagination spanned more than one page", msgPageCount > 1);
  check("B. at least one messages page came back short (the last one)", msgSawShortPage);

  const seenBodySet = new Set(seenBodies);
  check("B. no duplicate message appeared across pages", seenBodySet.size === seenBodies.length);

  const expectedBodies = Array.from({ length: TOTAL_MESSAGES }, (_, i) => `msg-${i}`);
  const recoveredMsgCount = expectedBodies.filter((b) => seenBodySet.has(b)).length;
  check(`B. every one of the ${TOTAL_MESSAGES} seeded messages was recovered exactly once`, recoveredMsgCount === TOTAL_MESSAGES);

  // Each individual page must itself be chronological-ascending (oldest to
  // newest) - apps/web/lib/api.ts's fetchMessages contract that
  // mergeOlderMessagesPage (Inbox pagination logic) depends on for correct
  // prepend order.
  const eachPageAscending = pageBodies.every((page) => {
    const indices = page.map((b) => Number(b.replace("msg-", "")));
    return indices.every((v, i) => i === 0 || v > indices[i - 1]);
  });
  check("B. each individual page is itself chronological-ascending (oldest-first within the page)", eachPageAscending);

  // The FULL walk (page 1 = newest, subsequent pages = progressively
  // older) reassembled in reverse-page-order must recover exact
  // chronological order 0..24 - confirms "older pages come from further
  // back in time", matching what Inbox.tsx's loadOlderMessages prepends.
  const reassembledOldestFirst = [...pageBodies].reverse().flat();
  check(
    "B. reassembling pages oldest-page-first recovers the exact original chronological send order",
    JSON.stringify(reassembledOldestFirst) === JSON.stringify(expectedBodies),
  );

  // ---------------------------------------------------------------
  // Shared contract checks (both endpoints)
  // ---------------------------------------------------------------
  const unauthConvRes = await fetch(`${BASE}/v1/conversations`);
  check("an unauthenticated conversations request is rejected (401)", unauthConvRes.status === 401);

  const malformedRes = await getJson(`${BASE}/v1/conversations?limit=5&cursor=not-valid-base64url-json%%%`, accessToken);
  check("a malformed conversations cursor does not crash the endpoint", malformedRes.status === 200);
  check("a malformed cursor is treated as no cursor (returns a first page)", Array.isArray(malformedRes.body.data) && malformedRes.body.data.length === 5);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
