import { Controller, Post } from "@nestjs/common";
import { IdentityMatchingService } from "./identity-matching.service";

/**
 * Dev-only manual trigger for `IdentityMatchingService`'s sweep (excluded
 * from `v1` versioning, `main.ts`'s `dev/(.*)` exclude list - the same
 * pattern `MockConnectorController`'s `/dev/mock-connector/send` already
 * establishes) - lets `verify-phase9.mjs` exercise the matching routine
 * deterministically instead of waiting out the real 10-minute interval.
 */
@Controller("dev/identity-matching")
export class DevIdentityMatchingController {
  constructor(private readonly matchingService: IdentityMatchingService) {}

  @Post("run")
  async run() {
    await this.matchingService.runOnce();
    return { ok: true };
  }
}
