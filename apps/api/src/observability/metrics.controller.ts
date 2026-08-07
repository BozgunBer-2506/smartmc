import { Controller, Get, Header } from "@nestjs/common";
import { MetricsService } from "./metrics.service";

/**
 * `GET /metrics` (docs/ROADMAP.md Phase 20.5) - real Prometheus exposition
 * format, scrapeable by any Prometheus instance pointed at this URL.
 * Unauthenticated by design, matching `/health`: a metrics endpoint is an
 * infrastructure concern, not a product resource, and Prometheus itself
 * has no bearer-token auth mechanism in its default scrape config -
 * network-level access control (a private network, an IP allowlist) is
 * the real boundary for this class of endpoint, same as `/health`.
 */
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async get(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
