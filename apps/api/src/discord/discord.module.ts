import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit/audit-log.module";
import { AuthModule } from "../auth/auth.module";
import { CredentialsStoreModule } from "../credentials-store/credentials-store.module";
import { EventsModule } from "../events/events.module";
import { DiscordController } from "./discord.controller";
import { DiscordGatewayManagerService } from "./discord-gateway-manager.service";
import { DiscordOAuthStateService } from "./discord-oauth-state.service";
import { DiscordReconciliationService } from "./discord-reconciliation.service";

@Module({
  imports: [AuthModule, EventsModule, CredentialsStoreModule, AuditLogModule],
  controllers: [DiscordController],
  providers: [DiscordOAuthStateService, DiscordGatewayManagerService, DiscordReconciliationService],
})
export class DiscordModule {}
