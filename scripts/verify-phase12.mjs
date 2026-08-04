import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `phase12-${randomBytes(6).toString("hex")}@example.com`;
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
 * Search regression (docs/ROADMAP.md Phase 12): Postgres full-text search
 * over messages (body + sender name + conversation title), a simpler
 * case-insensitive substring match over contacts, and the combined
 * cross-domain endpoint - all real, end-to-end against the running API
 * and Postgres. Attachments search and semantic search are out of scope
 * (no Attachment data exists to search; semantic search is Phase 13's
 * dependency) - see docs/reviews/phase-12-review.md.
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Phase 12 Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  await sendMock(accessToken, { senderDisplayName: "Priya Vendor", senderExternalId: "priya-vendor", bodyText: "Please find the invoice attached for last month's services." });
  await sendMock(accessToken, { senderDisplayName: "Jordan Ops", senderExternalId: "jordan-ops", bodyText: "The server outage is resolved, all systems normal." });
  await sendMock(accessToken, { senderDisplayName: "Alex Casual", senderExternalId: "alex-casual", bodyText: "Hey, just checking in, how are you?" });
  await sleep(600);

  // 1. Missing query is rejected.
  const missingQuery = await getJson(`${BASE}/v1/search/messages`, accessToken);
  check("GET /v1/search/messages with no ?q= is rejected (400)", missingQuery.status === 400);

  // 2. Full-text search matches body content.
  const invoiceSearch = await getJson(`${BASE}/v1/search/messages?q=invoice`, accessToken);
  check("searching 'invoice' finds the invoice message", invoiceSearch.body.data.some((m) => m.bodyText.includes("invoice")));
  check("searching 'invoice' does not return the unrelated casual message", !invoiceSearch.body.data.some((m) => m.bodyText.includes("checking in")));

  // 3. Full-text search also matches on sender display name, not just body.
  const senderSearch = await getJson(`${BASE}/v1/search/messages?q=Jordan`, accessToken);
  check("searching a sender's name finds their message", senderSearch.body.data.some((m) => m.senderDisplayName === "Jordan Ops"));

  // 4. A term with no match returns an empty array, not an error.
  const noMatch = await getJson(`${BASE}/v1/search/messages?q=xylophone`, accessToken);
  check("a non-matching query returns 200 with an empty array", noMatch.status === 200 && Array.isArray(noMatch.body.data) && noMatch.body.data.length === 0);

  // 5. Contact search - case-insensitive substring match.
  const contactSearch = await getJson(`${BASE}/v1/search/contacts?q=priya`, accessToken);
  check("case-insensitive contact search finds 'Priya Vendor'", contactSearch.body.data.some((c) => c.displayName === "Priya Vendor"));

  // 6. The combined endpoint fans out to both.
  const combined = await getJson(`${BASE}/v1/search?q=priya`, accessToken);
  check("the combined endpoint returns both messages and contacts", combined.body.messages.data.length > 0 && combined.body.contacts.data.length > 0);

  // 7. Workspace isolation - a second user's search never sees the first user's data.
  const otherEmail = `phase12-other-${randomBytes(6).toString("hex")}@example.com`;
  const otherRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: otherEmail, password, displayName: "Other User" }),
  });
  const otherToken = (await otherRes.json()).accessToken;
  const otherSearch = await getJson(`${BASE}/v1/search/messages?q=invoice`, otherToken);
  check("a second, unrelated user's search is empty (workspace isolation)", otherSearch.body.data.length === 0);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
