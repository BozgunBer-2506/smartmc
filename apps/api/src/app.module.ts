import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { EventsModule } from "./events/events.module";
import { MockConnectorModule } from "./mock-connector/mock-connector.module";
import { AuditLogModule } from "./audit/audit-log.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { CredentialsStoreModule } from "./credentials-store/credentials-store.module";
import { TelegramModule } from "./telegram/telegram.module";
import { DiscordModule } from "./discord/discord.module";

@Module({
  imports: [
    HealthModule,
    RealtimeModule,
    EventsModule,
    MockConnectorModule,
    AuditLogModule,
    AuthModule,
    UsersModule,
    ConversationsModule,
    NotificationsModule,
    CredentialsStoreModule,
    TelegramModule,
    DiscordModule,
  ],
})
export class AppModule {}
