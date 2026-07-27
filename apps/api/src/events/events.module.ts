import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { AutomationModule } from "../automation/automation.module";
import { EventsService } from "./events.service";
import { EventsProcessor } from "./events.processor";

@Module({
  imports: [RealtimeModule, AutomationModule],
  providers: [EventsService, EventsProcessor],
  exports: [EventsService],
})
export class EventsModule {}
