import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit/audit-log.module";
import { AuthModule } from "../auth/auth.module";
import { CredentialsStoreModule } from "../credentials-store/credentials-store.module";
import { EventsModule } from "../events/events.module";
import { SlackApiService } from "./slack-api.service";
import { SlackOAuthStateService } from "./slack-oauth-state.service";
import { SlackReconciliationService } from "./slack-reconciliation.service";
import { SlackController } from "./slack.controller";

@Module({
  imports: [AuthModule, EventsModule, CredentialsStoreModule, AuditLogModule],
  controllers: [SlackController],
  providers: [SlackApiService, SlackOAuthStateService, SlackReconciliationService],
})
export class SlackModule {}
