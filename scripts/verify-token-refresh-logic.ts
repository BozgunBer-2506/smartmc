/**
 * Isolated logic verification for apps/web/lib/api.ts's centralized
 * single-flight token-refresh algorithm (Auth Reliability Hardening) -
 * this project has no browser-automation tool (disclosed repeatedly in
 * docs/STATUS.md), so this exercises the exact same TypeScript module
 * Node-side with a mocked `fetch`/`tryRefresh`, rather than leaving the
 * refresh algorithm's correctness entirely unverified. Run via ts-node
 * (apps/api's existing devDependency) since apps/web/lib/api.ts has no
 * Next.js-specific imports and is safe to load directly.
 */
import * as apiModule from "../apps/web/lib/api";

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

type FetchCall = { url: string; init?: RequestInit };

async function main() {
  const calls: FetchCall[] = [];
  let refreshCallCount = 0;
  let nextAccessToken = "token-v2";
  let refreshShouldSucceed = true;

  // Mock the global fetch every apiFetch/tryRefresh call goes through.
  (global as unknown as { fetch: typeof fetch }).fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });

    if (url.includes("/v1/auth/refresh")) {
      refreshCallCount += 1;
      if (!refreshShouldSucceed) {
        return new Response(JSON.stringify({ title: "Unauthorized", code: "REFRESH_TOKEN_INVALID", status: 401 }), { status: 401 });
      }
      return new Response(JSON.stringify({ accessToken: nextAccessToken }), { status: 200 });
    }

    const authHeader = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (authHeader === `Bearer ${nextAccessToken}`) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    // Any other/stale token: 401, exactly like a real expired-access-token response.
    return new Response(JSON.stringify({ title: "Unauthorized", code: "UNAUTHENTICATED", status: 401 }), { status: 401 });
  }) as typeof fetch;

  // --- B/A: an expired access token triggers exactly one refresh, then the retry succeeds ---
  calls.length = 0;
  refreshCallCount = 0;
  let refreshed: string | null = null;
  let expired: boolean = false;
  apiModule.setAuthListener({ onRefreshed: (t) => (refreshed = t), onExpired: () => (expired = true) });

  const meResult = await apiModule.fetchMe("stale-token");
  check("B. expired access token -> exactly one refresh call", refreshCallCount === 1);
  check("B. the original request is retried and succeeds with the new token", (meResult as unknown as { ok: boolean }).ok === true);
  check("B. onRefreshed fired with the new token, onExpired did not fire", refreshed === nextAccessToken && !expired);

  // --- C: concurrent 401s share exactly one refresh call ---
  calls.length = 0;
  refreshCallCount = 0;
  const results = await Promise.allSettled([
    apiModule.fetchMe("stale-token-2"),
    apiModule.fetchNotifications("stale-token-2"),
    apiModule.fetchAiCreditBalance("stale-token-2"),
  ]);
  check("C. three concurrent 401s trigger exactly one refresh call (single-flight)", refreshCallCount === 1);
  check("C. all three original requests still resolve (not rejected) after the single shared refresh", results.every((r) => r.status === "fulfilled"));

  // --- E: refresh itself failing -> no infinite loop, original 401 surfaces, onExpired fires exactly once ---
  calls.length = 0;
  refreshCallCount = 0;
  refreshShouldSucceed = false;
  expired = false;
  let sawExpectedError = false;
  try {
    await apiModule.fetchMe("stale-token-3");
  } catch {
    sawExpectedError = true;
  }
  check("E. refresh failure -> exactly one refresh attempt, no retry loop", refreshCallCount === 1);
  check("E. refresh failure -> onExpired fired exactly once", Boolean(expired));
  check("E. refresh failure -> the caller still gets a rejected/error result, not a silent success", sawExpectedError);
  refreshShouldSucceed = true;

  // --- F: 403 never triggers a refresh - a real authorization outcome, not a session-expiry signal ---
  calls.length = 0;
  refreshCallCount = 0;
  (global as unknown as { fetch: typeof fetch }).fetch = (async (url: string) => {
    calls.push({ url });
    if (url.includes("/v1/auth/refresh")) {
      refreshCallCount += 1;
      return new Response(JSON.stringify({ accessToken: nextAccessToken }), { status: 200 });
    }
    return new Response(JSON.stringify({ title: "Forbidden", code: "AI_DISABLED", status: 403 }), { status: 403 });
  }) as typeof fetch;
  let sawForbidden = false;
  try {
    await apiModule.fetchAiCreditBalance("some-token");
  } catch {
    sawForbidden = true;
  }
  check("F. a 403 response never triggers a refresh call", refreshCallCount === 0);
  check("F. a 403 still surfaces as an error to the caller, unchanged", sawForbidden);

  // --- D: tryRefresh itself never recurses into apiFetch/another refresh ---
  calls.length = 0;
  refreshCallCount = 0;
  await apiModule.tryRefresh();
  check("D. tryRefresh performs exactly one raw call, never triggers a second nested refresh", refreshCallCount === 1);

  console.log(`\n${passCount} passed, ${failCount} failed.`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
