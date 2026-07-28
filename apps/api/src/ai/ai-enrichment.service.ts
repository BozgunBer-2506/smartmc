import { Injectable, Logger } from "@nestjs/common";
import { getPrismaClient } from "@smc/database";
import { defaultAIProviderRegistry, DEFAULT_AI_PROVIDER_NAME } from "@smc/ai";
import { AiCreditsService } from "./ai-credits.service";

export interface AiMessageContext {
  sentiment: "positive" | "neutral" | "negative";
  classification: string;
}

/**
 * Populates the Automation Engine's `ContextObject.ai` section for real
 * (ADR-0021, closing AUTOMATION_ENGINE.md Section 6/9's disclosed stub) -
 * called once per inbound message, before rule matching, exactly the
 * "context snapshot assembled once at the start of an execution" model
 * Section 10 already establishes for everything else in the Context
 * Object. Never called from anywhere else in the request path - AI
 * enrichment is a pure data-producing step; the rule engine (already
 * fully built, unchanged) is the only thing that ever acts on it.
 */
@Injectable()
export class AiEnrichmentService {
  private readonly logger = new Logger(AiEnrichmentService.name);

  constructor(private readonly credits: AiCreditsService) {}

  /** Returns `undefined` (never throws) when AI is disabled or out of credit - graceful degradation is the contract, not an edge case a caller has to special-case. */
  async enrichMessage(workspaceId: string, bodyText: string): Promise<AiMessageContext | undefined> {
    const prisma = getPrismaClient();
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace || !workspace.aiEnabled) return undefined;

    const balance = await this.credits.getBalance(workspace.organizationId);
    if (balance < 1) return undefined;

    try {
      const provider = defaultAIProviderRegistry.get(DEFAULT_AI_PROVIDER_NAME);
      const [sentiment, classification] = await Promise.all([
        provider.detectSentiment({ text: bodyText }),
        provider.classify({ text: bodyText }),
      ]);
      await this.credits.consume(workspace.organizationId, 1, "message_enrichment");
      return { sentiment: sentiment.sentiment, classification: classification.label };
    } catch (err) {
      // Never let AI enrichment break message ingestion - the message
      // still arrives, the rule engine still runs, just without `ai.*`
      // context available for this one message (PRODUCT.md's "AI never
      // load-bearing," made concrete for the ingestion path itself).
      this.logger.warn(`AI enrichment skipped for a message in workspace ${workspaceId}: ${err instanceof Error ? err.message : err}`);
      return undefined;
    }
  }
}
