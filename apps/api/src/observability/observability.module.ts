import { Global, Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { HttpMetricsInterceptor } from "./http-metrics.interceptor";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { RequestContextMiddleware } from "./request-context.middleware";

/**
 * Observability foundation (docs/ROADMAP.md Phase 20.5): request
 * correlation IDs, structured JSON access logging, and Prometheus
 * metrics. `@Global()` - `MetricsService` is injected from modules with
 * no direct dependency relationship to this one (e.g. `EventsProcessor`
 * for `connector_messages_received_total`), the same reasoning
 * `RateLimitModule` already applies for `RateLimitService`.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor }],
  exports: [MetricsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
