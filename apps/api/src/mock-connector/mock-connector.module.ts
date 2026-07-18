import { Module } from "@nestjs/common";
import { EventsModule } from "../events/events.module";
import { MockConnectorController } from "./mock-connector.controller";

@Module({
  imports: [EventsModule],
  controllers: [MockConnectorController],
})
export class MockConnectorModule {}
