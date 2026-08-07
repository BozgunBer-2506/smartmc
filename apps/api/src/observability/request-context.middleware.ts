import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { v7 as uuidv7 } from "uuid";
import { logger } from "./logger";

declare module "express" {
  interface Request {
    /** Set here, before any guard/controller runs - the single source of truth for this request's trace ID, reused by ProblemDetailsFilter so a success and a failure path for the same request never disagree on it. */
    traceId: string;
  }
}

/**
 * Request correlation ID + structured access log (docs/ROADMAP.md Phase
 * 20.5). Applied globally (see ObservabilityModule), before every other
 * middleware/guard, so `request.traceId` is always set by the time
 * anything downstream (a guard, a controller, the exception filter) runs.
 *
 * A client-supplied `X-Trace-Id` is honored rather than overwritten - a
 * caller that already has its own request-tracing convention (or is
 * retrying and wants the retry correlated with the original attempt) can
 * carry its own ID through; this service never rejects or second-guesses
 * it, it just also becomes the ID this service's own logs use.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const traceId = (req.headers["x-trace-id"] as string | undefined) || uuidv7();
    req.traceId = traceId;
    res.setHeader("X-Trace-Id", traceId);

    const startedAt = process.hrtime.bigint();

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info({
        traceId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: req.user?.sub,
        workspaceId: req.user?.workspaceId,
      });
    });

    next();
  }
}
