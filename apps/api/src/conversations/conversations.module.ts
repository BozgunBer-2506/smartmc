import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit/audit-log.module";
import { AuthModule } from "../auth/auth.module";
import { CredentialsStoreModule } from "../credentials-store/credentials-store.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ConversationsController } from "./conversations.controller";

@Module({
  imports: [AuthModule, RealtimeModule, CredentialsStoreModule, AuditLogModule],
  controllers: [ConversationsController],
})
export class ConversationsModule {}
