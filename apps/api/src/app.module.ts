import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { EventsModule } from "./events/events.module";
import { MockConnectorModule } from "./mock-connector/mock-connector.module";

@Module({
  imports: [HealthModule, RealtimeModule, EventsModule, MockConnectorModule],
})
export class AppModule {}
