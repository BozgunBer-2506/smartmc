/**
 * Verifies ResendTransactionalEmailService's request construction, success
 * and failure handling, and secret-non-leakage, by mocking global fetch -
 * no real network call, no real API key, no real Resend account needed.
 */
import { ResendApiError, ResendTransactionalEmailService } from "../apps/api/src/transactional-email/resend-transactional-email.service";

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

const SECRET_API_KEY = "re_test_sk_do_not_leak_12345";
const RESET_TOKEN_MARKER = "super-secret-reset-token-must-not-leak";
const RECIPIENT = "real-user@example.com";

async function main() {
  const originalFetch = global.fetch;
  const consoleLogCapture: string[] = [];
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  console.error = (...args: unknown[]) => {
    consoleLogCapture.push(args.map(String).join(" "));
  };
  console.log = (...args: unknown[]) => {
    consoleLogCapture.push(args.map(String).join(" "));
    originalConsoleLog(...args);
  };
  // NestJS's Logger writes via process.stdout/stderr directly, bypassing
  // console.log/console.error - captured too so a real secret leak through
  // the Logger would actually be caught by this script.
  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
    consoleLogCapture.push(String(chunk));
    return originalStdoutWrite(chunk as never, ...(rest as []));
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
    consoleLogCapture.push(String(chunk));
    return originalStderrWrite(chunk as never, ...(rest as []));
  }) as typeof process.stderr.write;

  try {
    // --- A. success path: request shape ---
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    global.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({ id: "test-id" }), { status: 200 });
    }) as typeof fetch;

    const service = new ResendTransactionalEmailService(SECRET_API_KEY, "noreply@example.com");
    const resetUrl = `https://app.example.com/reset-password?token=${RESET_TOKEN_MARKER}`;
    await service.sendPasswordReset(RECIPIENT, resetUrl);

    check("POSTs to the documented Resend endpoint", capturedUrl === "https://api.resend.com/emails");
    check("uses POST method", capturedInit?.method === "POST");
    const headers = capturedInit?.headers as Record<string, string> | undefined;
    check("sends Bearer auth with the configured API key", headers?.Authorization === `Bearer ${SECRET_API_KEY}`);
    check("sends JSON content type", headers?.["Content-Type"] === "application/json");

    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    check("body.from is the configured sender", body.from === "noreply@example.com");
    check("body.to is the recipient", body.to === RECIPIENT);
    check("body.subject is set", typeof body.subject === "string" && body.subject.length > 0);
    check("body.html contains the reset URL", typeof body.html === "string" && body.html.includes(resetUrl));
    check("body.text contains the reset URL", typeof body.text === "string" && body.text.includes(resetUrl));

    // --- B. failure path: non-2xx response ---
    global.fetch = (async () => new Response(JSON.stringify({ message: "invalid_api_key" }), { status: 401 })) as typeof fetch;
    let threwApiError = false;
    let apiErrorStatus: number | undefined;
    try {
      await service.sendPasswordReset(RECIPIENT, resetUrl);
    } catch (err) {
      threwApiError = err instanceof ResendApiError;
      apiErrorStatus = err instanceof ResendApiError ? err.status : undefined;
    }
    check("a non-2xx response throws ResendApiError", threwApiError);
    check("ResendApiError carries the HTTP status", apiErrorStatus === 401);

    // --- C. failure path: network error ---
    global.fetch = (async () => {
      throw new Error(`network down while calling ${RECIPIENT} with key ${SECRET_API_KEY}`);
    }) as typeof fetch;
    let threwOnNetworkError = false;
    let networkErrorMessage = "";
    try {
      await service.sendPasswordReset(RECIPIENT, resetUrl);
    } catch (err) {
      threwOnNetworkError = true;
      networkErrorMessage = err instanceof Error ? err.message : "";
    }
    check("a network error still throws (never a silent success)", threwOnNetworkError);
    check("the thrown network-error message is generic, not the raw caught error", !networkErrorMessage.includes(SECRET_API_KEY) && !networkErrorMessage.includes(RECIPIENT));

    // --- D. secret non-leakage across everything captured above ---
    const allCapturedOutput = consoleLogCapture.join("\n");
    check("the API key never appears in any log line", !allCapturedOutput.includes(SECRET_API_KEY));
    check("the reset token never appears in any log line", !allCapturedOutput.includes(RESET_TOKEN_MARKER));
    check("the recipient email never appears in any log line", !allCapturedOutput.includes(RECIPIENT));
    check("no Authorization header value ever appears in any log line", !allCapturedOutput.includes(`Bearer ${SECRET_API_KEY}`));
  } finally {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }

  console.log(`\n${passCount} passed, ${failCount} failed.`);
  process.exit(failCount > 0 ? 1 : 0);
}

main();
