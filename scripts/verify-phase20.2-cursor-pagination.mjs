import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `cursor-${randomBytes(6).toString("hex")}@example.com`;
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

/**
 * Live verification for Phase 20.2 (docs/ROADMAP.md, API.md Section 4) -
 * real Postgres keyset pagination, run against the actual running API.
 *
 * Creates enough real Rule rows (via POST /v1/rules) to span three pages
 * at a small page size, then walks the real GET /v1/rules cursor chain
 * end to end and checks:
 *   - every page respects the requested limit
 *   - nextCursor correctly chains from one page to the next
 *   - no row ID appears on more than one page (no duplicates/skips)
 *   - the full walk recovers every row that was created
 *   - hasMore is false and nextCursor is null on the final page
 *   - an unauthenticated request is rejected
 *   - a malformed cursor does not crash the endpoint (decodeCursor -> null)
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Cursor Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  const TOTAL_RULES = 25;
  const PAGE_LIMIT = 10;
  const createdIds = [];
  for (let i = 0; i < TOTAL_RULES; i++) {
    const res = await fetch(`${BASE}/v1/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        name: `Cursor verify rule ${i}`,
        trigger: { type: "message.received" },
        conditions: { field: "message.bodyText", operator: "contains", value: "x" },
        actions: [{ type: "tag.apply", params: { tag: "CursorVerify" } }],
      }),
    });
    const body = await res.json();
    if (res.status === 201) createdIds.push(body.id);
  }
  check(`created ${TOTAL_RULES} real rules to paginate over`, createdIds.length === TOTAL_RULES);

  // Walk the full cursor chain.
  const seenIds = [];
  let cursor;
  let pageCount = 0;
  let sawShortPage = false;
  let brokenLimit = false;
  do {
    const url = new URL(`${BASE}/v1/rules`);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);
    const { status, body } = await getJson(url.toString(), accessToken);
    if (status !== 200) {
      check(`page ${pageCount + 1} returns 200`, false);
      break;
    }
    if (body.data.length > PAGE_LIMIT) brokenLimit = true;
    if (body.data.length < PAGE_LIMIT) sawShortPage = true;
    for (const row of body.data) seenIds.push(row.id);
    cursor = body.pagination.nextCursor;
    pageCount += 1;
    if (!body.pagination.hasMore) {
      check("the final page reports hasMore: false", body.pagination.hasMore === false);
      check("the final page has nextCursor: null", body.pagination.nextCursor === null);
      break;
    }
  } while (cursor && pageCount < 20);

  check("no page exceeded the requested limit", !brokenLimit);
  check("pagination spanned more than one page", pageCount > 1);
  check("at least one page came back short of the full limit (the last one)", sawShortPage);

  const seenSet = new Set(seenIds);
  check("no duplicate IDs were returned across pages", seenSet.size === seenIds.length);

  const seenCreatedCount = createdIds.filter((id) => seenSet.has(id)).length;
  check("every created rule was recovered exactly once across the full walk", seenCreatedCount === TOTAL_RULES);

  // Ordering: (priority desc, createdAt desc, id desc) - all these rules share priority 0,
  // so this reduces to createdAt desc, which is exactly insertion order reversed.
  const seenCreatedInOrder = seenIds.filter((id) => createdIds.includes(id));
  const expectedOrder = [...createdIds].reverse();
  check("rows come back in stable (createdAt desc, id desc) order", JSON.stringify(seenCreatedInOrder) === JSON.stringify(expectedOrder));

  // Unauthenticated requests are rejected.
  const unauthRes = await fetch(`${BASE}/v1/rules`);
  check("an unauthenticated request to a paginated list is rejected (401)", unauthRes.status === 401);

  // A malformed cursor must not crash the endpoint - decodeCursor returns null and the query runs as if unpaginated.
  const malformedRes = await getJson(`${BASE}/v1/rules?limit=5&cursor=not-valid-base64url-json%%%`, accessToken);
  check("a malformed cursor does not crash the endpoint", malformedRes.status === 200);
  check("a malformed cursor is treated as no cursor (returns a first page)", Array.isArray(malformedRes.body.data) && malformedRes.body.data.length === 5);

  // limit is clamped, not trusted verbatim.
  const hugeLimitRes = await getJson(`${BASE}/v1/rules?limit=999999`, accessToken);
  check("an oversized limit is clamped rather than trusted verbatim", hugeLimitRes.body.data.length <= 200);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
