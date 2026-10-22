import type { Response } from "express";
import { authConfig } from "../config/auth.config";

/**
 * Factored out of auth.controller.ts (Phase 16.1) once a second
 * controller (workspace membership - create workspace, accept invite)
 * needed to issue a session and therefore set this same cookie, rather
 * than a second copy of these attributes drifting out of sync.
 */
export function setRefreshCookie(res: Response, token: string): void {
  const sameSite = authConfig.refreshCookieSameSite;
  res.cookie(authConfig.refreshCookieName, token, {
    httpOnly: true,
    secure: sameSite === "none" || process.env.NODE_ENV === "production",
    sameSite,
    path: authConfig.refreshCookiePath,
    maxAge: authConfig.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  });
}

/** Must match setRefreshCookie's sameSite/secure attributes - a mismatched clearCookie silently fails to delete a SameSite=None cookie in some browsers. */
export function clearRefreshCookie(res: Response): void {
  const sameSite = authConfig.refreshCookieSameSite;
  res.clearCookie(authConfig.refreshCookieName, {
    path: authConfig.refreshCookiePath,
    secure: sameSite === "none" || process.env.NODE_ENV === "production",
    sameSite,
  });
}
