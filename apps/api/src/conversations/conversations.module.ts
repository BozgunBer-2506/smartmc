import { forwardRef, Module } from "@nestjs/common";
import { AuditLogModule } from "../audit/audit-log.module";
import { AuthModule } from "../auth/auth.module";
import { CredentialsStoreModule } from "../credentials-store/credentials-store.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AutomationModule } from "../automation/automation.module";
import { ConversationsController } from "./conversations.controller";
import { MessageSendService } from "./message-send.service";

@Module({
  imports: [AuthModule, RealtimeModule, CredentialsStoreModule, AuditLogModule, forwardRef(() => AutomationModule)],
  controllers: [ConversationsController],
  providers: [MessageSendService],
  exports: [MessageSendService],
})
export class ConversationsModule {}
