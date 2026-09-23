import { Controller, NotFoundException, Post } from "@nestjs/common";
import { DevPasswordResetFaultInjectorService } from "./dev-password-reset-fault-injector.service";

/**
 * Dev-only trigger for DevPasswordResetFaultInjectorService - same
 * "404 in production, not 403" pattern as mock-connector.controller.ts
 * and dev-transactional-email.controller.ts. This endpoint doesn't exist
 * as a concept outside development.
 */
@Controller("dev/password-reset")
export class DevPasswordResetFaultInjectorController {
  constructor(private readonly injector: DevPasswordResetFaultInjectorService) {}

  @Post("arm-tx-failure")
  arm() {
    if (process.env.NODE_ENV === "production") {
      throw new NotFoundException();
    }
    this.injector.arm();
    return { status: "armed" };
  }
}
