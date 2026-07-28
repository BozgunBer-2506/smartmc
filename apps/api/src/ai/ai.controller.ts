import { Body, Controller, Get, HttpStatus, Patch, Post, UseGuards } from "@nestjs/common";
import { getPrismaClient, newId } from "@smc/database";
import { defaultAIProviderRegistry, DEFAULT_AI_PROVIDER_NAME, type RewriteStyle } from "@smc/ai";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";
import { AiCreditsService } from "./ai-credits.service";

interface SummarizeDto {
  messageId?: string;
  conversationId?: string;
}
interface TextDto {
  text?: string;
}
interface RewriteDto {
  text?: string;
  style?: RewriteStyle;
}
interface RuleSuggestionDto {
  naturalLanguagePrompt?: string;
}
interface SettingsDto {
  aiEnabled?: boolean;
}

/**
 * The AI capability surface (docs/API.md Section 10, ADR-0021). Every
 * endpoint here follows the same shape: check `Workspace.aiEnabled`
 * (403 `AI_DISABLED` if off - a deliberate setting, not an outage),
 * consume one credit (402 `INSUFFICIENT_AI_CREDITS` if the organization
 * is out), call the registered `AIProvider`, return a structured result.
 * Every response is synchronous `200` (`HeuristicAIProvider` is
 * instantaneous) with a `status: "completed"` field, matching API.md's
 * "discriminated by a status field either way" requirement without
 * needing the async job path this phase's provider never triggers.
 */
@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly credits: AiCreditsService) {}

  @Get("settings")
  async getSettings(@CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: claims.workspaceId } });
    return { aiEnabled: workspace.aiEnabled };
  }

  @Patch("settings")
  async updateSettings(@Body() dto: SettingsDto, @CurrentUser() claims: JwtPayload) {
    if (typeof dto.aiEnabled !== "boolean") {
      throw httpError(HttpStatus.BAD_REQUEST, "AI_ENABLED_REQUIRED", "aiEnabled (boolean) is required.");
    }
    const prisma = getPrismaClient();
    const workspace = await prisma.workspace.update({ where: { id: claims.workspaceId }, data: { aiEnabled: dto.aiEnabled } });
    return { aiEnabled: workspace.aiEnabled };
  }

  @Get("credits/balance")
  async getBalance(@CurrentUser() claims: JwtPayload) {
    const organizationId = await this.organizationIdFor(claims.workspaceId);
    return { balance: await this.credits.getBalance(organizationId) };
  }

  @Get("credits/ledger")
  async getLedger(@CurrentUser() claims: JwtPayload) {
    const organizationId = await this.organizationIdFor(claims.workspaceId);
    return this.credits.listLedger(organizationId);
  }

  @Post("summaries")
  async summarize(@Body() dto: SummarizeDto, @CurrentUser() claims: JwtPayload) {
    if (!dto.messageId && !dto.conversationId) {
      throw httpError(HttpStatus.BAD_REQUEST, "MESSAGE_OR_CONVERSATION_REQUIRED", "Provide either messageId or conversationId.");
    }
    const prisma = getPrismaClient();
    let text: string;
    let kind: "message" | "conversation";
    if (dto.messageId) {
      const message = await prisma.message.findFirst({ where: { id: dto.messageId, workspaceId: claims.workspaceId } });
      if (!message) throw httpError(HttpStatus.NOT_FOUND, "MESSAGE_NOT_FOUND", "Message not found.");
      text = message.bodyText;
      kind = "message";
    } else {
      const messages = await prisma.message.findMany({
        where: { conversationId: dto.conversationId, workspaceId: claims.workspaceId },
        orderBy: { receivedAt: "asc" },
        take: 100,
      });
      if (messages.length === 0) throw httpError(HttpStatus.NOT_FOUND, "CONVERSATION_NOT_FOUND", "Conversation not found or has no messages.");
      text = messages.map((m) => m.bodyText).join("\n");
      kind = "conversation";
    }

    await this.requireCredit(claims.workspaceId, "summarize", dto.messageId);
    const provider = defaultAIProviderRegistry.get(DEFAULT_AI_PROVIDER_NAME);
    const result = await provider.summarize({ text, kind });

    await prisma.messageAiSummary.create({
      data: {
        id: newId(),
        workspaceId: claims.workspaceId,
        messageId: dto.messageId ?? null,
        conversationId: dto.conversationId ?? null,
        summaryText: result.summary,
        modelUsed: result.modelUsed,
        generatedAt: new Date(),
      },
    });

    return { status: "completed", ...result };
  }

  @Post("suggested-replies")
  async suggestedReplies(@Body() dto: TextDto, @CurrentUser() claims: JwtPayload) {
    if (!dto.text || dto.text.trim().length === 0) {
      throw httpError(HttpStatus.BAD_REQUEST, "TEXT_REQUIRED", "text is required.");
    }
    await this.requireCredit(claims.workspaceId, "suggested-replies");
    const provider = defaultAIProviderRegistry.get(DEFAULT_AI_PROVIDER_NAME);
    const result = await provider.suggestReplies({ text: dto.text });
    return { status: "completed", ...result };
  }

  @Post("detect-commitments")
  async detectCommitments(@Body() dto: TextDto, @CurrentUser() claims: JwtPayload) {
    if (!dto.text || dto.text.trim().length === 0) {
      throw httpError(HttpStatus.BAD_REQUEST, "TEXT_REQUIRED", "text is required.");
    }
    await this.requireCredit(claims.workspaceId, "detect-commitments");
    const provider = defaultAIProviderRegistry.get(DEFAULT_AI_PROVIDER_NAME);
    const [commitments, meetings] = await Promise.all([
      provider.detectCommitments({ text: dto.text }),
      provider.detectMeetings({ text: dto.text }),
    ]);
    return { status: "completed", commitments: commitments.commitments, meetings: meetings.meetings, modelUsed: commitments.modelUsed };
  }

  @Post("rewrite")
  async rewrite(@Body() dto: RewriteDto, @CurrentUser() claims: JwtPayload) {
    if (!dto.text || dto.text.trim().length === 0) {
      throw httpError(HttpStatus.BAD_REQUEST, "TEXT_REQUIRED", "text is required.");
    }
    if (!dto.style || !["formal", "friendly", "concise"].includes(dto.style)) {
      throw httpError(HttpStatus.BAD_REQUEST, "INVALID_STYLE", "style must be one of formal, friendly, concise.");
    }
    await this.requireCredit(claims.workspaceId, "rewrite");
    const provider = defaultAIProviderRegistry.get(DEFAULT_AI_PROVIDER_NAME);
    const result = await provider.rewrite({ text: dto.text, style: dto.style });
    return { status: "completed", ...result };
  }

  /**
   * AUTOMATION_ENGINE.md Section 8.3/8.4, API.md's `/v1/ai/rule-suggestions`
   * - returns a draft `Rule` (`isDraft: true`), never persisted. The user
   * reviews it in the builder and explicitly `POST`s it through the
   * normal `/v1/rules` endpoint to activate it - this endpoint has no
   * ability to create a live rule itself.
   */
  @Post("rule-suggestions")
  async suggestRule(@Body() dto: RuleSuggestionDto, @CurrentUser() claims: JwtPayload) {
    if (!dto.naturalLanguagePrompt || dto.naturalLanguagePrompt.trim().length === 0) {
      throw httpError(HttpStatus.BAD_REQUEST, "PROMPT_REQUIRED", "naturalLanguagePrompt is required.");
    }
    await this.requireCredit(claims.workspaceId, "rule-suggestions");
    const provider = defaultAIProviderRegistry.get(DEFAULT_AI_PROVIDER_NAME);
    const result = await provider.suggestRule({ naturalLanguagePrompt: dto.naturalLanguagePrompt });
    return { status: "completed", ...result };
  }

  private async organizationIdFor(workspaceId: string): Promise<string> {
    const prisma = getPrismaClient();
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    return workspace.organizationId;
  }

  private async requireCredit(workspaceId: string, feature: string, relatedMessageId?: string): Promise<void> {
    const prisma = getPrismaClient();
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    if (!workspace.aiEnabled) {
      throw httpError(HttpStatus.FORBIDDEN, "AI_DISABLED", "AI is disabled for this workspace.");
    }
    try {
      await this.credits.consume(workspace.organizationId, 1, feature, relatedMessageId);
    } catch {
      throw httpError(
        HttpStatus.PAYMENT_REQUIRED,
        "INSUFFICIENT_AI_CREDITS",
        "This workspace has run out of AI credits.",
      );
    }
  }
}

