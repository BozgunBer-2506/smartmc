import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * A thin helper so auth errors carry a specific, stable `code`
 * (docs/API.md Section 5) instead of falling back to the generic
 * status-derived code every other unhandled exception gets.
 */
export function authError(status: HttpStatus, code: string, message: string): HttpException {
  return new HttpException({ message, code }, status);
}
