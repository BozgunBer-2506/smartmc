import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `phase13-${randomBytes(6).toString("hex")}@example.com`;
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

async function req(method, url, accessToken, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
}

async function getJson(url, accessToken) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
}

/**
 * Phase 20.1's real AI rate limit (apps/api/src/config/rate-limit.config.ts)
 * now applies to every /v1/ai/* call this script makes - a well-behaved
 * client self-throttles using the X-RateLimit-* headers the guard sends
 * on every response, rather than assuming unlimited calls. Used only by
 * the credit-drain loop below, which deliberately makes far more AI
 * calls than any real single-session usage would.
 */
async function waitForAiBudgetIfExhausted(res) {
  const remaining = Number(res.headers.get("x-ratelimit-remaining"));
  if (remaining > 0) return;
  const resetAt = Number(res.headers.get("x-ratelimit-reset"));
  const waitMs = Math.max(0, resetAt * 1000 - Date.now()) + 1000;
  console.log(`  (AI rate limit window exhausted - waiting ${Math.ceil(waitMs / 1000)}s for it to reset)`);
  await sleep(waitMs);
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
 * AI Layer regression (docs/ROADMAP.md Phase 13, docs/adr/0021). Real,
 * end-to-end checks against the running API: every AI endpoint's
 * `HeuristicAIProvider` output, credit consumption/402 exhaustion, the
 * AI_DISABLED 403 path, the draft-rule-suggestion "never auto-created"
 * guarantee, and - the core architectural claim - that `ai.classification`
 * populated by the event-driven `AiEnrichmentService` is real,
 * consumable data a normal Automation Engine rule condition can match on,
 * with graceful degradation confirmed when AI is disabled.
 */
async function main() {
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Phase 13 Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  // 1. Starter grant + default settings.
  const settings = await getJson(`${BASE}/v1/ai/settings`, accessToken);
  check("AI is enabled by default for a new workspace", settings.body.aiEnabled === true);
  const initialBalance = await getJson(`${BASE}/v1/ai/credits/balance`, accessToken);
  check("a new workspace gets a starter AI credit grant (50)", initialBalance.body.balance === 50);

  // 2. Summaries.
  await sendMock(accessToken, { senderDisplayName: "Jordan", senderExternalId: "jordan-ai", bodyText: "Thanks so much for the quick help. Are you available for a call at 3pm tomorrow?" });
  await sleep(600);
  const conversations = await getJson(`${BASE}/v1/conversations`, accessToken);
  const msgId = conversations.body[0]?.lastMessage?.id;
  check("a message exists to summarize", Boolean(msgId));

  const summary = await req("POST", `${BASE}/v1/ai/summaries`, accessToken, { messageId: msgId });
  check("POST /v1/ai/summaries returns a completed summary", summary.status === 201 && summary.body.status === "completed" && typeof summary.body.summary === "string");

  const balanceAfterSummary = await getJson(`${BASE}/v1/ai/credits/balance`, accessToken);
  check("summarizing consumed exactly 1 credit", balanceAfterSummary.body.balance === initialBalance.body.balance - 2); // -1 for message enrichment on ingest, -1 for the summary call

  // 3. Suggested replies, commitments, rewrite.
  const replies = await req("POST", `${BASE}/v1/ai/suggested-replies`, accessToken, { text: "Are you available for a call at 3pm?" });
  check("suggested-replies returns at least one reply", replies.status === 201 && replies.body.replies.length > 0);

  const commitments = await req("POST", `${BASE}/v1/ai/detect-commitments`, accessToken, { text: "I will send the invoice by Friday." });
  check("detect-commitments finds the commitment", commitments.body.commitments.some((c) => c.text.includes("I will send the invoice")));

  const rewrite = await req("POST", `${BASE}/v1/ai/rewrite`, accessToken, { text: "dont worry, its fine", style: "formal" });
  check("rewrite (formal) capitalizes and punctuates", /^Dont worry, its fine\./.test(rewrite.body.rewritten));

  // 4. Rule suggestions - matched, draft, never persisted.
  const rulesBefore = await getJson(`${BASE}/v1/rules`, accessToken);
  const suggestion = await req("POST", `${BASE}/v1/ai/rule-suggestions`, accessToken, { naturalLanguagePrompt: "notify me if a VIP messages" });
  check("a recognizable prompt returns a matched draft rule", suggestion.body.matched === true && suggestion.body.draft?.isDraft === true);
  check("the draft targets sender.isVip", suggestion.body.draft?.conditions?.field === "sender.isVip");
  const rulesAfterSuggestion = await getJson(`${BASE}/v1/rules`, accessToken);
  check("suggesting a rule never creates a real rule", rulesAfterSuggestion.body.length === rulesBefore.body.length);

  const unmatchedSuggestion = await req("POST", `${BASE}/v1/ai/rule-suggestions`, accessToken, { naturalLanguagePrompt: "make my coffee every morning" });
  check("an unrecognizable prompt returns matched: false with a note", unmatchedSuggestion.body.matched === false && typeof unmatchedSuggestion.body.note === "string");

  // 5. ai.classification is real, consumable rule-condition data - the core architectural claim.
  const aiRule = await req("POST", `${BASE}/v1/rules`, accessToken, {
    name: "Tag support messages",
    trigger: { type: "message.received" },
    conditions: { field: "ai.classification", operator: "equals", value: "support" },
    actions: [{ type: "tag.apply", params: { tag: "Support" } }],
  });
  check("creating an ai.classification-conditioned rule succeeds", aiRule.status === 201);
  const aiRuleId = aiRule.body.id;

  await sendMock(accessToken, { senderDisplayName: "Casey Support", senderExternalId: "casey-support", bodyText: "This is broken and not working, I need help with an error." });
  await sleep(700);
  const supportExecutions = await getJson(`${BASE}/v1/rules/${aiRuleId}/executions`, accessToken);
  check("the ai.classification rule fires for a support-shaped message", supportExecutions.body.length === 1 && supportExecutions.body[0].status === "success");

  await sendMock(accessToken, { senderDisplayName: "Dana Casual", senderExternalId: "dana-casual", bodyText: "Hey, just checking in, how are you?" });
  await sleep(700);
  const supportExecutionsAfterCasual = await getJson(`${BASE}/v1/rules/${aiRuleId}/executions`, accessToken);
  check("the ai.classification rule does not fire for an unrelated message", supportExecutionsAfterCasual.body.length === 1);

  // 6. AI_DISABLED - graceful degradation, not an error state.
  await req("PATCH", `${BASE}/v1/ai/settings`, accessToken, { aiEnabled: false });
  const disabledSummary = await req("POST", `${BASE}/v1/ai/summaries`, accessToken, { messageId: msgId });
  check("summarizing with AI disabled returns 403 AI_DISABLED", disabledSummary.status === 403 && disabledSummary.body.code === "AI_DISABLED");

  await sendMock(accessToken, { senderDisplayName: "Erin Support", senderExternalId: "erin-support", bodyText: "This is broken, I need help with an error, not working." });
  await sleep(700);
  const supportExecutionsWhileDisabled = await getJson(`${BASE}/v1/rules/${aiRuleId}/executions`, accessToken);
  check("with AI disabled, a support-shaped message does not populate ai.classification (rule doesn't fire, no error)", supportExecutionsWhileDisabled.body.length === 1);

  await req("PATCH", `${BASE}/v1/ai/settings`, accessToken, { aiEnabled: true });
  const reEnabled = await getJson(`${BASE}/v1/ai/settings`, accessToken);
  check("re-enabling AI succeeds", reEnabled.body.aiEnabled === true);

  // 7. Credit exhaustion -> 402, not a broken state. Drains far more
  // credits than any real single-session AI rate limit allows, so this
  // deliberately paces itself against the X-RateLimit-* headers rather
  // than assuming every call succeeds immediately (see
  // waitForAiBudgetIfExhausted above).
  let balance = (await getJson(`${BASE}/v1/ai/credits/balance`, accessToken)).body.balance;
  let lastStatus = 201;
  let guard = 0;
  while (balance > 0 && guard < 200) {
    const res = await req("POST", `${BASE}/v1/ai/rewrite`, accessToken, { text: "quick test", style: "concise" });
    lastStatus = res.status;
    guard += 1;
    if (res.status === 201) {
      balance -= 1;
    } else if (res.status === 429) {
      await waitForAiBudgetIfExhausted(res);
    } else {
      break; // an unexpected status - stop draining and let the check below report it honestly
    }
  }
  check("credits were drained to 0 via repeated calls", balance === 0);
  const exhausted = await req("POST", `${BASE}/v1/ai/rewrite`, accessToken, { text: "one more", style: "concise" });
  check("calling an AI endpoint with 0 credits returns 402 INSUFFICIENT_AI_CREDITS", exhausted.status === 402 && exhausted.body.code === "INSUFFICIENT_AI_CREDITS");
  void lastStatus;

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
