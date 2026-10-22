import type { Request } from "express";
import type { RequestContext } from "../auth/session.service";

/**
 * Same (ipAddress, userAgent) extraction auth.controller.ts's own
 * buildContext already does for register/login/refresh - factored out
 * here (Phase 16.1) once a second controller (workspace membership)
 * needed to issue a session too, rather than a third copy of the same
 * two lines.
 */
export function buildRequestContext(req: Request): RequestContext {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  };
}
