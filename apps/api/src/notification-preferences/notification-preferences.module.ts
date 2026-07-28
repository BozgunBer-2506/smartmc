import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationPreferencesController } from "./notification-preferences.controller";

@Module({
  imports: [AuthModule],
  controllers: [NotificationPreferencesController],
})
export class NotificationPreferencesModule {}
