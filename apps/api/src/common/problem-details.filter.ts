import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response, Request } from "express";
import { v7 as uuidv7 } from "uuid";

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  code: string;
  traceId: string;
  errors: unknown[] | null;
}

/**
 * Converts every thrown exception into the RFC 7807 problem+json shape
 * specified in docs/API.md Section 5 - applied globally starting Phase 1,
 * per the Phase 1 review's finding that this gets more expensive to
 * retrofit the more endpoints exist (5 endpoints today, not 50).
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const traceId = uuidv7();
    const { status, code, title, detail, errors } = this.normalize(exception);

    if (status >= 500) {
      this.logger.error(
        `[${traceId}] ${title}: ${detail ?? ""}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const problem: ProblemDetails = {
      type: `https://docs.smartmessagecenter.com/errors/${code.toLowerCase().replace(/_/g, "-")}`,
      title,
      status,
      detail,
      instance: request.url,
      code,
      traceId,
      errors: errors ?? null,
    };

    response.status(status).type("application/problem+json").json(problem);
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    title: string;
    detail?: string;
    errors?: unknown[];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === "object" && body !== null) {
        const b = body as Record<string, unknown>;
        const message = b.message;
        // A thrown exception can supply its own specific `code` (e.g.
        // AuthException in apps/api/src/auth/auth.exceptions.ts) - preferred
        // over the generic status-derived one wherever present, per
        // API.md Section 5's per-error `code` design.
        const code = typeof b.code === "string" ? b.code : this.codeForStatus(status);
        return {
          status,
          code,
          title: typeof b.error === "string" ? b.error : exception.message,
          detail: Array.isArray(message) ? undefined : (message as string | undefined),
          errors: Array.isArray(message) ? (message as unknown[]) : undefined,
        };
      }

      return { status, code: this.codeForStatus(status), title: exception.message };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "UNKNOWN",
      title: "Internal server error",
      detail: exception instanceof Error ? exception.message : undefined,
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "VALIDATION_ERROR";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      case HttpStatus.TOO_MANY_REQUESTS:
        return "RATE_LIMITED";
      default:
        return status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR";
    }
  }
}
