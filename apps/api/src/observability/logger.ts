import pino from "pino";

/**
 * Structured JSON logging (docs/ROADMAP.md Phase 20.5). A single
 * process-wide pino instance, deliberately not `nestjs-pino`'s
 * Nest-Logger-replacement machinery - existing `new Logger(ClassName.name)`
 * call sites across the codebase are untouched (out of scope for this
 * phase, a much larger sweep); this backs exactly one new thing: one
 * structured JSON line per HTTP request, emitted by
 * `RequestContextMiddleware`, plus any other call site that explicitly
 * wants a structured (not plain-text) log line.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
