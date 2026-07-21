import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit/audit-log.module";
import { AuthModule } from "../auth/auth.module";
import { CredentialsStoreModule } from "../credentials-store/credentials-store.module";
import { EventsModule } from "../events/events.module";
import { TelegramApiService } from "./telegram-api.service";
import { TelegramController } from "./telegram.controller";
import { TelegramReconciliationService } from "./telegram-reconciliation.service";

@Module({
  imports: [AuthModule, EventsModule, CredentialsStoreModule, AuditLogModule],
  controllers: [TelegramController],
  providers: [TelegramApiService, TelegramReconciliationService],
})
export class TelegramModule {}
