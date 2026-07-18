import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * A thin helper so thrown errors carry a specific, stable `code`
 * (docs/API.md Section 5) instead of falling back to the generic
 * status-derived code every other unhandled exception gets. Used across
 * every module, not just auth - moved out of apps/api/src/auth in Phase 3
 * once conversations/notifications needed it too.
 */
export function httpError(status: HttpStatus, code: string, message: string): HttpException {
  return new HttpException({ message, code }, status);
}
