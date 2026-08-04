import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `sortorder-${randomBytes(6).toString("hex")}@example.com`;
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

function isSorted(values, order) {
  for (let i = 1; i < values.length; i++) {
    if (order === "asc" && values[i] < values[i - 1]) return false;
    if (order === "desc" && values[i] > values[i - 1]) return false;
  }
  return true;
}

/**
 * Live verification for Phase 20.3 (docs/ROADMAP.md, API.md's allowlist-
 * per-resource sorting convention), run against the actual running API.
 *
 * Covers exactly the checklist agreed for this phase:
 *   - a per-endpoint sortBy whitelist (an unrecognized value falls back to
 *     the default field rather than erroring or accepting an arbitrary
 *     column)
 *   - order=asc / order=desc are both real, not just a DESC default
 *   - a cursor stays self-consistent with the sortBy/order it was minted
 *     under across a multi-page walk, even if a client omits sortBy/order
 *     on later requests (cursor-pagination.ts's keysetOr contract)
 *   - the API response envelope is unchanged - only the request side grew
 *     ?sortBy=/?order=
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Sort Order Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  // --- Rules: sortBy=name whitelist + asc/desc + multi-page cursor consistency ---
  const ruleNames = ["Zulu", "Mango", "Alpha", "Delta", "Echo", "Bravo", "Foxtrot", "Golf"];
  for (const name of ruleNames) {
    await fetch(`${BASE}/v1/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        name,
        trigger: { type: "message.received" },
        conditions: { field: "message.bodyText", operator: "contains", value: "x" },
        actions: [{ type: "tag.apply", params: { tag: "SortVerify" } }],
      }),
    });
  }

  const ascPage1 = await getJson(`${BASE}/v1/rules?limit=3&sortBy=name&order=asc`, accessToken);
  check("rules sortBy=name&order=asc returns 200", ascPage1.status === 200);
  const ascNames1 = ascPage1.body.data.map((r) => r.name);
  check("page 1 of sortBy=name&order=asc is alphabetically sorted", isSorted(ascNames1, "asc"));

  // Follow the cursor WITHOUT resending sortBy/order - the cursor itself must carry them.
  const ascPage2 = await getJson(`${BASE}/v1/rules?limit=3&cursor=${encodeURIComponent(ascPage1.body.pagination.nextCursor)}`, accessToken);
  const ascNames2 = ascPage2.body.data.map((r) => r.name);
  check(
    "page 2 (cursor followed without resending sortBy/order) continues the same alphabetical walk",
    ascNames2[0] > ascNames1[ascNames1.length - 1] && isSorted(ascNames2, "asc"),
  );
  check("no rule name repeats between page 1 and page 2", ascNames1.every((n) => !ascNames2.includes(n)));

  const descPage1 = await getJson(`${BASE}/v1/rules?limit=3&sortBy=name&order=desc`, accessToken);
  const descNames1 = descPage1.body.data.map((r) => r.name);
  check("rules sortBy=name&order=desc is reverse-sorted", isSorted(descNames1, "desc"));
  check("asc and desc don't return the same first row", ascNames1[0] !== descNames1[0]);

  const defaultPage = await getJson(`${BASE}/v1/rules?limit=3`, accessToken);
  check("omitting sortBy keeps the pre-20.3 default (createdAt-desc) order, not name order", defaultPage.body.data[0].name !== ascNames1[0]);

  const bogusSort = await getJson(`${BASE}/v1/rules?limit=3&sortBy=notARealColumn`, accessToken);
  check("an unrecognized sortBy does not 400", bogusSort.status === 200);
  check(
    "an unrecognized sortBy falls back to the endpoint's default rather than erroring or matching the whitelist blindly",
    JSON.stringify(bogusSort.body.data.map((r) => r.id)) === JSON.stringify(defaultPage.body.data.map((r) => r.id)),
  );

  // --- Conversations: sortBy=lastMessageAt asc/desc via the Mock Connector ---
  const senders = ["Casey", "Avery", "Blair"];
  for (const name of senders) {
    await fetch(`${BASE}/dev/mock-connector/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ senderDisplayName: name, senderExternalId: `${name}-sortverify`, bodyText: `hello from ${name}` }),
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 500));

  const convAsc = await getJson(`${BASE}/v1/conversations?limit=10&sortBy=lastMessageAt&order=asc`, accessToken);
  const convAscSenders = convAsc.body.data.map((c) => c.lastMessage?.sender?.displayName).filter((n) => senders.includes(n));
  check("conversations sortBy=lastMessageAt&order=asc returns senders oldest-message-first", JSON.stringify(convAscSenders) === JSON.stringify(senders));

  const convDesc = await getJson(`${BASE}/v1/conversations?limit=10&sortBy=lastMessageAt&order=desc`, accessToken);
  const convDescSenders = convDesc.body.data.map((c) => c.lastMessage?.sender?.displayName).filter((n) => senders.includes(n));
  check(
    "conversations sortBy=lastMessageAt&order=desc returns senders newest-message-first (reverse of asc)",
    JSON.stringify(convDescSenders) === JSON.stringify([...senders].reverse()),
  );

  // --- Contacts: sortBy=displayName order=desc ---
  const contactsDesc = await getJson(`${BASE}/v1/contacts?limit=10&sortBy=displayName&order=desc`, accessToken);
  const contactNames = contactsDesc.body.data.map((c) => c.displayName);
  check("contacts sortBy=displayName&order=desc is reverse-alphabetically sorted", isSorted(contactNames, "desc"));

  // --- Notifications: order= only (single sortable field) ---
  const notifAsc = await getJson(`${BASE}/v1/notifications?limit=20&order=asc`, accessToken);
  const notifAscTimes = notifAsc.body.data.map((n) => n.createdAt);
  check("notifications order=asc returns oldest-first", isSorted(notifAscTimes, "asc"));
  const notifDesc = await getJson(`${BASE}/v1/notifications?limit=20&order=desc`, accessToken);
  const notifDescTimes = notifDesc.body.data.map((n) => n.createdAt);
  check("notifications order=desc returns newest-first (the pre-20.3 default)", isSorted(notifDescTimes, "desc"));

  // --- Response envelope unchanged: still {data, pagination} ---
  check(
    "the response envelope is unchanged by this phase (still {data, pagination})",
    Array.isArray(ascPage1.body.data) && "nextCursor" in ascPage1.body.pagination && "hasMore" in ascPage1.body.pagination,
  );

  // --- Unauthenticated / malformed cursor still behave per Phase 20.2 ---
  const unauthRes = await fetch(`${BASE}/v1/rules?sortBy=name`);
  check("an unauthenticated sortBy request is still rejected (401)", unauthRes.status === 401);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
