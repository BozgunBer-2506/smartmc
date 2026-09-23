import { Controller, Delete, Get, NotFoundException } from "@nestjs/common";
import { InMemoryTransactionalEmailService } from "./in-memory-transactional-email.service";

/**
 * Dev-only inspection surface for the in-memory transactional-email fake
 * (see in-memory-transactional-email.service.ts) - the only way a
 * verification script can confirm `sendPasswordReset` was actually called
 * with the right recipient/URL, since there's no real inbox to check yet.
 * Injects the concrete class directly, not the TransactionalEmailService
 * interface token - `getSentEmails`/`clear` are dev-inspection-only, not
 * part of the real interface any future provider would implement. Same
 * "404 in production, not 403" pattern as mock-connector.controller.ts -
 * this endpoint doesn't exist as a concept outside development.
 */
@Controller("dev/transactional-email")
export class DevTransactionalEmailController {
  constructor(private readonly emailService: InMemoryTransactionalEmailService) {}

  @Get("sent")
  list() {
    this.guardDevOnly();
    return { data: this.emailService.getSentEmails() };
  }

  @Delete("sent")
  clear() {
    this.guardDevOnly();
    this.emailService.clear();
    return { status: "ok" };
  }

  private guardDevOnly(): void {
    if (process.env.NODE_ENV === "production") {
      throw new NotFoundException();
    }
  }
}
