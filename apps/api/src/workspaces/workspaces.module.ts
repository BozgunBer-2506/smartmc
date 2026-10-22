import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit/audit-log.module";
import { AuthModule } from "../auth/auth.module";
import { CredentialsStoreModule } from "../credentials-store/credentials-store.module";
import { DiscordModule } from "../discord/discord.module";
import { EventsModule } from "../events/events.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { TelegramModule } from "../telegram/telegram.module";
import { WorkspaceDeletionService } from "./workspace-deletion.service";
import { WorkspaceMembershipController } from "./workspace-membership.controller";
import { WorkspaceMembershipService } from "./workspace-membership.service";
import { WorkspacesController } from "./workspaces.controller";

@Module({
  imports: [AuthModule, AuditLogModule, CredentialsStoreModule, TelegramModule, DiscordModule, RealtimeModule, EventsModule],
  controllers: [WorkspacesController, WorkspaceMembershipController],
  providers: [WorkspaceDeletionService, WorkspaceMembershipService],
  // Exported so UsersModule's account deletion (Phase 2B) can reuse this
  // exact, already-tested service for each sole-owned workspace, instead
  // of reimplementing workspace erasure a second time.
  exports: [WorkspaceDeletionService],
})
export class WorkspacesModule {}
