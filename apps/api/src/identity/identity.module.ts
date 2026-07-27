import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit/audit-log.module";
import { AuthModule } from "../auth/auth.module";
import { ContactsController } from "./contacts.controller";
import { DevIdentityMatchingController } from "./dev-identity-matching.controller";
import { IdentityMatchingService } from "./identity-matching.service";
import { IdentityController } from "./identity.controller";

@Module({
  imports: [AuthModule, AuditLogModule],
  controllers: [IdentityController, ContactsController, DevIdentityMatchingController],
  providers: [IdentityMatchingService],
})
export class IdentityModule {}
