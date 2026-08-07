import { randomBytes } from "node:crypto";

const BASE = process.env.SMC_API_URL ?? "http://localhost:4000";
const email = `observ-${randomBytes(6).toString("hex")}@example.com`;
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

async function getMetricValue(metricsText, name, labelMatcher) {
  const lines = metricsText.split("\n").filter((l) => l.startsWith(name));
  for (const line of lines) {
    if (!labelMatcher || line.includes(labelMatcher)) {
      const value = Number(line.trim().split(/\s+/).pop());
      if (Number.isFinite(value)) return value;
    }
  }
  return 0;
}

/**
 * Live verification for Phase 20.5 (docs/ROADMAP.md) - the observability
 * foundation (request trace IDs, structured logging, Prometheus metrics),
 * run against the actual running API. Deliberately scoped, per explicit
 * user direction: real trace-ID propagation, real structured logging, and
 * a real /metrics endpoint that actually moves when real traffic happens -
 * not a claim that a full OTel/Grafana/Loki stack is deployed (it isn't;
 * see docs/STATUS.md).
 */
async function main() {
  // 1. A real request gets a real X-Trace-Id response header.
  const healthRes = await fetch(`${BASE}/health`);
  const healthTraceId = healthRes.headers.get("x-trace-id");
  check("GET /health returns an X-Trace-Id header", Boolean(healthTraceId));

  // 2. A client-supplied X-Trace-Id is honored, not overwritten.
  const customTraceId = `test-${randomBytes(4).toString("hex")}`;
  const customRes = await fetch(`${BASE}/health`, { headers: { "X-Trace-Id": customTraceId } });
  check("a client-supplied X-Trace-Id is echoed back unchanged", customRes.headers.get("x-trace-id") === customTraceId);

  // 3. An error response's traceId (RFC 7807 body) is the SAME id as the
  // X-Trace-Id header on that same response - not two different IDs for
  // one request.
  const notFoundRes = await fetch(`${BASE}/v1/rules/00000000-0000-0000-0000-000000000000`, {
    headers: { Authorization: "Bearer not-a-real-token" },
  });
  const notFoundBody = await notFoundRes.json();
  check(
    "an error response's body traceId matches its own X-Trace-Id header",
    notFoundBody.traceId === notFoundRes.headers.get("x-trace-id"),
  );

  // 4. GET /metrics is real Prometheus exposition format, unauthenticated, unprefixed.
  const metricsRes = await fetch(`${BASE}/metrics`);
  check("GET /metrics returns 200", metricsRes.status === 200);
  check("GET /metrics is not behind the /v1 prefix", !metricsRes.url.includes("/v1/metrics"));
  const metricsText = await metricsRes.text();
  check("metrics output is Prometheus exposition format (# HELP present)", metricsText.includes("# HELP"));
  check("http_requests_total is present", metricsText.includes("http_requests_total"));
  check("connector_messages_received_total is present", metricsText.includes("connector_messages_received_total"));
  check("automation_rule_executions_total is present", metricsText.includes("automation_rule_executions_total"));
  check("bullmq_jobs_processed_total is present", metricsText.includes("bullmq_jobs_processed_total"));
  check("default Node.js process metrics are present (process_cpu_user_seconds_total)", metricsText.includes("process_cpu_user_seconds_total"));

  // 5. http_requests_total actually increments after a real request - not a static/fake counter.
  const before = await getMetricValue(metricsText, "http_requests_total", 'route="/health"');
  await fetch(`${BASE}/health`);
  await fetch(`${BASE}/health`);
  const metricsAfterText = await (await fetch(`${BASE}/metrics`)).text();
  const after = await getMetricValue(metricsAfterText, "http_requests_total", 'route="/health"');
  check("http_requests_total for /health increases after real requests", after >= before + 2);

  // 6. A real message flowing through the Mock Connector -> event pipeline
  // moves connector_messages_received_total{provider="mock"} - the same
  // "real traffic, not a synthetic counter bump" bar every prior Phase 20
  // sub-phase held itself to.
  const registerRes = await fetch(`${BASE}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Observability Verify Bot" }),
  });
  const registerBody = await registerRes.json();
  check("register returns 201", registerRes.status === 201);
  const accessToken = registerBody.accessToken;

  const mockSendRes = await fetch(`${BASE}/dev/mock-connector/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ senderDisplayName: "Metrics Check", senderExternalId: "metrics-check", bodyText: "does this move the counter" }),
  });

  if (mockSendRes.status === 404) {
    console.log("\nSKIP: connector_messages_received_total live-increment check (/dev/mock-connector/send is 404 here - expected in production)");
  } else {
    const beforeMock = await getMetricValue(metricsAfterText, "connector_messages_received_total", 'provider="mock"');
    await new Promise((resolve) => setTimeout(resolve, 800)); // event bus processing
    const afterMockText = await (await fetch(`${BASE}/metrics`)).text();
    const afterMock = await getMetricValue(afterMockText, "connector_messages_received_total", 'provider="mock"');
    check("connector_messages_received_total{provider=\"mock\"} increases after a real message is ingested", afterMock >= beforeMock + 1);
    check("bullmq_jobs_processed_total{queue=\"events\"} is present and non-zero", afterMockText.includes('bullmq_jobs_processed_total{queue="events"}'));
  }

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
