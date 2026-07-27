import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CredentialsStoreModule } from "../credentials-store/credentials-store.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { RuleExecutionService } from "./rule-execution.service";
import { RulesController } from "./rules.controller";
import { SchedulerService } from "./scheduler.service";

@Module({
  imports: [AuthModule, CredentialsStoreModule, RealtimeModule],
  controllers: [RulesController],
  providers: [RuleExecutionService, SchedulerService],
  exports: [RuleExecutionService, SchedulerService],
})
export class AutomationModule {}
