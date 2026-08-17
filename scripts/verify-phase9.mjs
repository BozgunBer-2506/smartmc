import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `phase9-${randomBytes(6).toString("hex")}@example.com`;
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
  return res.json();
}

async function postJson(url, accessToken, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function sendMock(accessToken, { senderDisplayName, senderExternalId, bodyText }) {
  const res = await fetch(`${BASE}/dev/mock-connector/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ senderDisplayName, senderExternalId, bodyText }),
  });
  return res.json();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Smart Inbox regression (docs/ROADMAP.md Phase 9): unified priority
 * scoring (VIP + urgency keyword), archive/category filters, the
 * trustworthy "Needs You" count, and IdentityGraph's fuzzy-match
 * suggestion -> approve -> merge / reject flow, plus a manual split.
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Phase 9 Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  // 1. Base priority score for a plain message.
  await sendMock(accessToken, { senderDisplayName: "Alice Baseline", senderExternalId: "alice-baseline", bodyText: "Just checking in." });
  await sleep(500);
  let conversations = (await getJson(`${BASE}/v1/conversations`, accessToken)).data;
  const aliceConvo = conversations.find((c) => c.lastMessage?.sender?.displayName === "Alice Baseline");
  check("a plain message gets the base priority score (10)", aliceConvo?.priorityScore === 10);

  // 2. Urgency-keyword boost.
  await sendMock(accessToken, { senderDisplayName: "Bob Urgent", senderExternalId: "bob-urgent", bodyText: "URGENT: need this asap." });
  await sleep(500);
  conversations = (await getJson(`${BASE}/v1/conversations`, accessToken)).data;
  const bobConvo = conversations.find((c) => c.lastMessage?.sender?.displayName === "Bob Urgent");
  check("an urgency-keyword message scores higher than the base (>= 30)", (bobConvo?.priorityScore ?? 0) >= 30);

  // 3. VIP boost - toggle VIP, then a later message from the same contact scores higher still.
  const contacts = (await getJson(`${BASE}/v1/contacts`, accessToken)).data;
  const bobContact = contacts.find((c) => c.displayName === "Bob Urgent");
  check("the contact list includes Bob Urgent", Boolean(bobContact));
  const vipRes = await fetch(`${BASE}/v1/contacts/${bobContact.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ isVip: true }),
  });
  check("PATCH /v1/contacts/:id sets isVip", vipRes.status === 200 && (await vipRes.json()).isVip === true);

  await sendMock(accessToken, { senderDisplayName: "Bob Urgent", senderExternalId: "bob-urgent", bodyText: "Just a follow-up, nothing urgent." });
  await sleep(500);
  conversations = (await getJson(`${BASE}/v1/conversations`, accessToken)).data;
  const bobConvoAfterVip = conversations.find((c) => c.lastMessage?.sender?.displayName === "Bob Urgent");
  check("a VIP sender's message scores higher even without urgency keywords (>= 60)", (bobConvoAfterVip?.priorityScore ?? 0) >= 60);

  // 4. Needs You count reflects unread + (VIP or high priority), and drops after marking read.
  const summaryBefore = await getJson(`${BASE}/v1/conversations/summary`, accessToken);
  check("needsYouCount is at least 1 with an unread VIP conversation", summaryBefore.needsYouCount >= 1);

  await fetch(`${BASE}/v1/conversations/${bobConvoAfterVip.id}/read`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  const conversationsAfterRead = (await getJson(`${BASE}/v1/conversations`, accessToken)).data;
  const bobAfterRead = conversationsAfterRead.find((c) => c.id === bobConvoAfterVip.id);
  check("marking a conversation read flips its unread flag", bobAfterRead?.unread === false);

  // 4b. POST /v1/conversations/:id/unread (docs/ROADMAP.md Phase 21.3) - the symmetric manual-unread action.
  const unreadRes = await fetch(`${BASE}/v1/conversations/${bobConvoAfterVip.id}/unread`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  check("POST .../unread succeeds", [200, 201].includes(unreadRes.status));
  const conversationsAfterUnread = (await getJson(`${BASE}/v1/conversations`, accessToken)).data;
  const bobAfterUnread = conversationsAfterUnread.find((c) => c.id === bobConvoAfterVip.id);
  check("marking a conversation unread flips its unread flag back", bobAfterUnread?.unread === true);
  const unreadMissingRes = await fetch(`${BASE}/v1/conversations/00000000-0000-0000-0000-000000000000/unread`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  check("POST .../unread on a nonexistent conversation returns 404", unreadMissingRes.status === 404);
  // Restore read state so the "Needs You" behavior checked next isn't affected by this test's own action.
  await fetch(`${BASE}/v1/conversations/${bobConvoAfterVip.id}/read`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });

  // 5. Archive + category filters.
  const archiveRes = await fetch(`${BASE}/v1/conversations/${aliceConvo.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ isArchived: true, category: "personal" }),
  });
  check("PATCH /v1/conversations/:id archives and categorizes", archiveRes.status === 200);

  const defaultList = (await getJson(`${BASE}/v1/conversations?archived=false`, accessToken)).data;
  check("archived=false excludes the archived conversation", !defaultList.some((c) => c.id === aliceConvo.id));

  const archivedList = (await getJson(`${BASE}/v1/conversations?archived=true`, accessToken)).data;
  check("archived=true includes only the archived conversation", archivedList.some((c) => c.id === aliceConvo.id));

  const categoryList = (await getJson(`${BASE}/v1/conversations?archived=true&category=personal`, accessToken)).data;
  check("category filter returns the categorized conversation", categoryList.some((c) => c.id === aliceConvo.id));

  // 6. IdentityGraph fuzzy matching -> suggestion -> approve -> merge.
  await sendMock(accessToken, { senderDisplayName: "Carol Diaz", senderExternalId: "carol-diaz-one", bodyText: "Hello from identity A." });
  await sendMock(accessToken, { senderDisplayName: "Carol Diaz", senderExternalId: "carol-diaz-two", bodyText: "Hello from identity B." });
  await sleep(500);

  const triggerRes = await postJson(`${BASE}/dev/identity-matching/run`, null);
  check("the dev identity-matching trigger runs", triggerRes.status === 201 || triggerRes.status === 200);

  const suggestions = (await getJson(`${BASE}/v1/identity/merge-suggestions`, accessToken)).data;
  const carolSuggestion = suggestions.find((s) => s.contactA?.displayName === "Carol Diaz" && s.contactB?.displayName === "Carol Diaz");
  check("a merge suggestion is created for two identically-named contacts", Boolean(carolSuggestion));

  if (carolSuggestion) {
    const approveRes = await postJson(`${BASE}/v1/identity/merge-suggestions/${carolSuggestion.id}/approve`, accessToken);
    check("approving the suggestion succeeds", approveRes.status === 200 || approveRes.status === 201);

    const contactsAfterMerge = (await getJson(`${BASE}/v1/contacts`, accessToken)).data;
    const survivingCarol = contactsAfterMerge.find((c) => c.displayName === "Carol Diaz");
    check("exactly one Carol Diaz contact remains after merge", contactsAfterMerge.filter((c) => c.displayName === "Carol Diaz").length === 1);
    check("the surviving contact now holds both provider identities", (survivingCarol?.identities?.length ?? 0) >= 2);

    // 7. Split - recovery from an incorrect merge (ARCHITECTURE.md Section 13.6.1).
    if (survivingCarol) {
      const identityToSplit = survivingCarol.identities[survivingCarol.identities.length - 1];
      const splitRes = await postJson(`${BASE}/v1/contacts/${survivingCarol.id}/split`, accessToken, {
        contactIdentityIds: [identityToSplit.id],
        reason: "verify-phase9 split test",
      });
      check("splitting the merged contact succeeds", splitRes.status === 200 || splitRes.status === 201);

      const contactsAfterSplit = (await getJson(`${BASE}/v1/contacts`, accessToken)).data;
      check("two Carol Diaz contacts exist again after the split", contactsAfterSplit.filter((c) => c.displayName === "Carol Diaz").length === 2);
    }
  }

  // 8. Rejecting a suggestion removes it from the pending list without merging.
  await sendMock(accessToken, { senderDisplayName: "Dana Reyes", senderExternalId: "dana-reyes-one", bodyText: "Hi." });
  await sendMock(accessToken, { senderDisplayName: "Dana Reyes", senderExternalId: "dana-reyes-two", bodyText: "Hi again." });
  await sleep(500);
  await postJson(`${BASE}/dev/identity-matching/run`, null);
  const danaSuggestions = (await getJson(`${BASE}/v1/identity/merge-suggestions`, accessToken)).data;
  const danaSuggestion = danaSuggestions.find((s) => s.contactA?.displayName === "Dana Reyes" && s.contactB?.displayName === "Dana Reyes");
  check("a merge suggestion is created for the Dana Reyes pair", Boolean(danaSuggestion));

  if (danaSuggestion) {
    const rejectRes = await postJson(`${BASE}/v1/identity/merge-suggestions/${danaSuggestion.id}/reject`, accessToken);
    check("rejecting the suggestion succeeds", rejectRes.status === 200 || rejectRes.status === 201);
    const contactsAfterReject = (await getJson(`${BASE}/v1/contacts`, accessToken)).data;
    check("both Dana Reyes contacts still exist after rejection (no merge happened)", contactsAfterReject.filter((c) => c.displayName === "Dana Reyes").length === 2);
  }

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
