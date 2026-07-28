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
import { SlackModule } from "./slack/slack.module";
import { EmailModule } from "./email/email.module";
import { IdentityModule } from "./identity/identity.module";
import { AutomationModule } from "./automation/automation.module";
import { NotificationPreferencesModule } from "./notification-preferences/notification-preferences.module";
import { SearchModule } from "./search/search.module";
import { AiModule } from "./ai/ai.module";

@Module({
  imports: [
    HealthModule,
    RealtimeModule,
    AutomationModule,
    EventsModule,
    MockConnectorModule,
    AuditLogModule,
    AuthModule,
    UsersModule,
    ConversationsModule,
    NotificationsModule,
    NotificationPreferencesModule,
    SearchModule,
    AiModule,
    CredentialsStoreModule,
    TelegramModule,
    DiscordModule,
    SlackModule,
    EmailModule,
    IdentityModule,
  ],
})
export class AppModule {}
