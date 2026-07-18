import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { MockConnectorController } from "./mock-connector.controller";

@Module({
  imports: [EventsModule, AuthModule],
  controllers: [MockConnectorController],
})
export class MockConnectorModule {}
