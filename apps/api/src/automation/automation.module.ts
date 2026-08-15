import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CredentialsStoreModule } from "../credentials-store/credentials-store.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AiModule } from "../ai/ai.module";
import { PushModule } from "../push/push.module";
import { ConversationsModule } from "../conversations/conversations.module";
import { RuleExecutionService } from "./rule-execution.service";
import { RulesController } from "./rules.controller";
import { SchedulerService } from "./scheduler.service";
import { ScheduledMessageService } from "./scheduled-message.service";
import { ScheduledMessagesController } from "./scheduled-messages.controller";

@Module({
  imports: [AuthModule, CredentialsStoreModule, RealtimeModule, AiModule, PushModule, forwardRef(() => ConversationsModule)],
  controllers: [RulesController, ScheduledMessagesController],
  providers: [RuleExecutionService, SchedulerService, ScheduledMessageService],
  exports: [RuleExecutionService, SchedulerService, ScheduledMessageService],
})
export class AutomationModule {}
