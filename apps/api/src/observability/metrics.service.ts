import { Injectable } from "@nestjs/common";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/**
 * Prometheus-compatible metrics (docs/ROADMAP.md Phase 20.5), scraped via
 * `GET /metrics`. A dedicated `Registry` rather than prom-client's global
 * default - explicit about exactly what this process exposes, and safe
 * against a second `collectDefaultMetrics()` call anywhere else in the
 * process silently double-registering.
 *
 * Metric names/labels follow Prometheus naming convention
 * (`_total` for counters, base units - seconds, not ms - for durations).
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequestsTotal = new Counter({
    name: "http_requests_total",
    help: "Total HTTP requests handled, by method/route/status.",
    labelNames: ["method", "route", "status"] as const,
    registers: [this.registry],
  });

  readonly httpErrorsTotal = new Counter({
    name: "http_errors_total",
    help: "Total HTTP requests that ended in a 4xx/5xx response, by method/route/status.",
    labelNames: ["method", "route", "status"] as const,
    registers: [this.registry],
  });

  readonly httpRequestDurationSeconds = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds, by method/route/status.",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5],
    registers: [this.registry],
  });

  /** docs/ROADMAP.md Phase 20.5 - one counter per connector, incremented once a message clears IdentityGraph resolution and is durably written (see EventsProcessor.handleMessageReceived), never on a duplicate/no-op. */
  readonly connectorMessagesReceivedTotal = new Counter({
    name: "connector_messages_received_total",
    help: "Total inbound messages successfully ingested, by provider.",
    labelNames: ["provider"] as const,
    registers: [this.registry],
  });

  /** One counter per terminal RuleExecutionLog.status (docs/AUTOMATION_ENGINE.md Section 5.4). */
  readonly ruleExecutionsTotal = new Counter({
    name: "automation_rule_executions_total",
    help: "Total automation rule executions, by terminal status.",
    labelNames: ["status"] as const,
    registers: [this.registry],
  });

  /** Incremented from each BullMQ Worker's own "completed" event (docs/ROADMAP.md Phase 20.5) - a real job outcome, not a polled queue-depth snapshot. */
  readonly bullmqJobsProcessedTotal = new Counter({
    name: "bullmq_jobs_processed_total",
    help: "Total BullMQ jobs completed successfully, by queue.",
    labelNames: ["queue"] as const,
    registers: [this.registry],
  });

  /** Incremented from each BullMQ Worker's own "failed" event, after BullMQ has exhausted that job's configured retry attempts. */
  readonly bullmqJobsFailedTotal = new Counter({
    name: "bullmq_jobs_failed_total",
    help: "Total BullMQ jobs that failed (after exhausting retries), by queue.",
    labelNames: ["queue"] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  recordHttpRequest(method: string, route: string, status: number, durationSeconds: number): void {
    const labels = { method, route, status: String(status) };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, durationSeconds);
    if (status >= 400) this.httpErrorsTotal.inc(labels);
  }
}
