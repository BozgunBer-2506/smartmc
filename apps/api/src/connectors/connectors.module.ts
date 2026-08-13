import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ConnectorsController } from "./connectors.controller";

@Module({
  imports: [AuthModule],
  controllers: [ConnectorsController],
})
export class ConnectorsModule {}
