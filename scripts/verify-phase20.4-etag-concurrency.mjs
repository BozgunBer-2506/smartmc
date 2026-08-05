import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `etag-${randomBytes(6).toString("hex")}@example.com`;
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

function unquote(etag) {
  return etag ? etag.replace(/^W\//, "").replace(/^"|"$/g, "") : etag;
}

/**
 * Live verification for Phase 20.4 (docs/API.md Section 8, ROADMAP.md) -
 * real HTTP-native optimistic concurrency (ETag/If-Match/If-None-Match),
 * run against the actual running API. Scope: Rule (has a real `version`
 * column) and NotificationPreference (gained one this phase) - the only
 * two resources with both a version column and an existing mutation
 * endpoint. LinkedAccount settings and Workspace/Organization settings are
 * deliberately out of scope this round (no settings-mutation endpoint /
 * no version column to hang concurrency off yet) - see docs/STATUS.md.
 *
 * Covers exactly what the delivery criterion calls for:
 *   - GET returns a real ETag
 *   - If-None-Match on GET returns a real 304 with no body
 *   - PATCH without If-Match is rejected (428)
 *   - PATCH with a stale If-Match is rejected (412), not silently applied
 *   - PATCH with the correct If-Match succeeds and returns a new ETag
 *   - a genuine two-client race (both fetch, one edits, the other's PATCH
 *     with its now-stale ETag) really 412s - not simulated, an actual
 *     second PATCH sent after the first one committed
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "ETag Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  // --- Rules ---
  const createRes = await fetch(`${BASE}/v1/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      name: "ETag verify rule",
      trigger: { type: "message.received" },
      conditions: { field: "message.bodyText", operator: "contains", value: "x" },
      actions: [{ type: "tag.apply", params: { tag: "T" } }],
    }),
  });
  const rule = await createRes.json();
  check("rule creation returns 201", createRes.status === 201);

  const getRes = await fetch(`${BASE}/v1/rules/${rule.id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const etag1 = getRes.headers.get("etag");
  check("GET /v1/rules/:id returns a real ETag header", Boolean(etag1));
  check("the ETag matches the rule's version", unquote(etag1) === String(rule.version));

  const notModifiedRes = await fetch(`${BASE}/v1/rules/${rule.id}`, {
    headers: { Authorization: `Bearer ${accessToken}`, "If-None-Match": etag1 },
  });
  check("If-None-Match with the current ETag returns 304", notModifiedRes.status === 304);
  const notModifiedBody = await notModifiedRes.text();
  check("a 304 response has no body", notModifiedBody.length === 0);

  const missingIfMatchRes = await fetch(`${BASE}/v1/rules/${rule.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ isEnabled: false }),
  });
  check("PATCH without If-Match is rejected (428)", missingIfMatchRes.status === 428);

  const staleIfMatchRes = await fetch(`${BASE}/v1/rules/${rule.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "If-Match": '"999999"' },
    body: JSON.stringify({ isEnabled: false }),
  });
  check("PATCH with a stale/wrong If-Match is rejected (412)", staleIfMatchRes.status === 412);
  const staleConflictBody = await staleIfMatchRes.json();
  check("a 412 response reports code OPTIMISTIC_LOCK_FAILURE", staleConflictBody.code === "OPTIMISTIC_LOCK_FAILURE");
  check("a 412 response still carries a fresh ETag for the current version", Boolean(staleIfMatchRes.headers.get("etag")));

  const correctPatchRes = await fetch(`${BASE}/v1/rules/${rule.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "If-Match": etag1 },
    body: JSON.stringify({ isEnabled: false }),
  });
  check("PATCH with the correct If-Match succeeds (200)", correctPatchRes.status === 200);
  const patchedRule = await correctPatchRes.json();
  const etag2 = correctPatchRes.headers.get("etag");
  check("a successful PATCH returns a new, different ETag", Boolean(etag2) && etag2 !== etag1);
  check("the new ETag matches the new version", unquote(etag2) === String(patchedRule.version));

  // A genuine race: two "clients" both fetch the same rule, one edits
  // successfully, the other's PATCH (still holding the now-stale ETag it
  // fetched before either edit happened) must 412, not silently overwrite.
  const clientA = await fetch(`${BASE}/v1/rules/${rule.id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const etagA = clientA.headers.get("etag");
  const clientB = await fetch(`${BASE}/v1/rules/${rule.id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const etagB = clientB.headers.get("etag");
  check("both racing clients fetched the same starting ETag", etagA === etagB);

  const clientAWrite = await fetch(`${BASE}/v1/rules/${rule.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "If-Match": etagA },
    body: JSON.stringify({ priority: 5 }),
  });
  check("client A's write (first to arrive) succeeds", clientAWrite.status === 200);

  const clientBWrite = await fetch(`${BASE}/v1/rules/${rule.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "If-Match": etagB },
    body: JSON.stringify({ priority: 9 }),
  });
  check("client B's write (stale ETag, arrived second) is rejected with a real 412 - not a silent overwrite", clientBWrite.status === 412);

  const finalRule = await (await fetch(`${BASE}/v1/rules/${rule.id}`, { headers: { Authorization: `Bearer ${accessToken}` } })).json();
  check("the rule reflects client A's write, not client B's lost update", finalRule.priority === 5);

  // --- NotificationPreference ---
  const prefsGet1 = await fetch(`${BASE}/v1/notification-preferences`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const prefsEtag1 = prefsGet1.headers.get("etag");
  check("GET /v1/notification-preferences returns an ETag even before anything is saved", prefsEtag1 === '"new"');

  const prefsMissingIfMatch = await fetch(`${BASE}/v1/notification-preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ vipOverrideEnabled: false }),
  });
  check("PATCH notification-preferences without If-Match is rejected (428)", prefsMissingIfMatch.status === 428);

  const prefsFirstSave = await fetch(`${BASE}/v1/notification-preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "If-Match": '"new"' },
    body: JSON.stringify({ vipOverrideEnabled: false, keywordAlerts: ["urgent"] }),
  });
  check("first-ever PATCH with If-Match: \"new\" creates the row (200)", prefsFirstSave.status === 200);
  const savedPrefs = await prefsFirstSave.json();
  const prefsEtag2 = prefsFirstSave.headers.get("etag");
  check("the created row gets a real numeric ETag", unquote(prefsEtag2) === String(savedPrefs.version));

  const prefsStaleNew = await fetch(`${BASE}/v1/notification-preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "If-Match": '"new"' },
    body: JSON.stringify({ vipOverrideEnabled: true }),
  });
  check("a second If-Match: \"new\" (row now exists) is rejected (412), not silently re-created", prefsStaleNew.status === 412);

  const prefsCorrectUpdate = await fetch(`${BASE}/v1/notification-preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "If-Match": prefsEtag2 },
    body: JSON.stringify({ vipOverrideEnabled: true }),
  });
  check("PATCH with the correct current ETag succeeds", prefsCorrectUpdate.status === 200);
  const prefsEtag3 = prefsCorrectUpdate.headers.get("etag");
  check("a successful preferences update returns a new ETag", prefsEtag3 !== prefsEtag2);

  const prefsStaleUpdate = await fetch(`${BASE}/v1/notification-preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "If-Match": prefsEtag2 },
    body: JSON.stringify({ vipOverrideEnabled: false }),
  });
  check("PATCH with the now-stale prior ETag is rejected (412)", prefsStaleUpdate.status === 412);

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
