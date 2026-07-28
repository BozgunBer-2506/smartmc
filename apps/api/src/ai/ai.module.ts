import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AiController } from "./ai.controller";
import { AiCreditsService } from "./ai-credits.service";
import { AiEnrichmentService } from "./ai-enrichment.service";

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiCreditsService, AiEnrichmentService],
  exports: [AiCreditsService, AiEnrichmentService],
})
export class AiModule {}
