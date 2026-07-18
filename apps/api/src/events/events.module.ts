import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { EventsService } from "./events.service";
import { EventsProcessor } from "./events.processor";

@Module({
  imports: [RealtimeModule],
  providers: [EventsService, EventsProcessor],
  exports: [EventsService],
})
export class EventsModule {}
