import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { MetricsService } from "./metrics.service";

/**
 * Records `http_requests_total`/`http_request_duration_seconds`/
 * `http_errors_total` for every request (docs/ROADMAP.md Phase 20.5).
 * Global, via `APP_INTERCEPTOR` (same registration pattern as
 * `RateLimitGuard`'s `APP_GUARD`).
 *
 * Uses the matched route *pattern* (`req.route.path`, e.g.
 * `/rules/:id`), not the raw URL - a raw path would give every distinct
 * resource ID its own Prometheus time series, an unbounded-cardinality
 * metric that would eventually overwhelm any real Prometheus instance
 * scraping it.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    const start = process.hrtime.bigint();
    const route = (request.route?.path as string | undefined) ?? request.path;
    const method = request.method;

    const record = (status: number) => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1_000_000_000;
      this.metrics.recordHttpRequest(method, route, status, durationSeconds);
    };

    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode),
        error: (err: unknown) => record(err instanceof HttpException ? err.getStatus() : 500),
      }),
    );
  }
}
