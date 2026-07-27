import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit/audit-log.module";
import { AuthModule } from "../auth/auth.module";
import { CredentialsStoreModule } from "../credentials-store/credentials-store.module";
import { EventsModule } from "../events/events.module";
import { EmailPollingService } from "./email-polling.service";
import { EmailController } from "./email.controller";

@Module({
  imports: [AuthModule, EventsModule, CredentialsStoreModule, AuditLogModule],
  controllers: [EmailController],
  providers: [EmailPollingService],
})
export class EmailModule {}
