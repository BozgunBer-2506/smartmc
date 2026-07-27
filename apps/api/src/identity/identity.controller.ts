import { Controller, Get, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { getPrismaClient } from "@smc/database";
import { approveMergeSuggestion, MergeSuggestionNotPendingError, rejectMergeSuggestion } from "@smc/identity";
import { AuditLogService } from "../audit/audit-log.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";

/**
 * The human-review surface for IdentityGraph's merge-suggestion queue
 * (docs/ROADMAP.md Phase 9, ARCHITECTURE.md Section 13.6). Every candidate
 * `IdentityMatchingService` finds sits here as `pending` until a user
 * explicitly approves or rejects it - there is no auto-apply path.
 */
@Controller("identity")
export class IdentityController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get("merge-suggestions")
  @UseGuards(JwtAuthGuard)
  async listSuggestions(@CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();
    const suggestions = await prisma.identityMergeSuggestion.findMany({
      where: { workspaceId: claims.workspaceId, status: "pending" },
      orderBy: { createdAt: "desc" },
    });

    const contactIds = [...new Set(suggestions.flatMap((s) => [s.candidateContactIdA, s.candidateContactIdB]))];
    const contacts = await prisma.contact.findMany({ where: { id: { in: contactIds } } });
    const contactById = new Map(contacts.map((c) => [c.id, c]));

    return suggestions.map((suggestion) => ({
      id: suggestion.id,
      confidenceScore: Number(suggestion.confidenceScore),
      matchingSignals: suggestion.matchingSignals as unknown,
      contactA: contactById.has(suggestion.candidateContactIdA)
        ? { id: suggestion.candidateContactIdA, displayName: contactById.get(suggestion.candidateContactIdA)?.displayName }
        : null,
      contactB: contactById.has(suggestion.candidateContactIdB)
        ? { id: suggestion.candidateContactIdB, displayName: contactById.get(suggestion.candidateContactIdB)?.displayName }
        : null,
      createdAt: suggestion.createdAt,
      expiresAt: suggestion.expiresAt,
    }));
  }

  @Post("merge-suggestions/:id/approve")
  @UseGuards(JwtAuthGuard)
  async approve(@Param("id") id: string, @CurrentUser() claims: JwtPayload) {
    const suggestion = await this.requireOwnSuggestion(id, claims.workspaceId);

    let result;
    try {
      result = await approveMergeSuggestion(id, claims.sub);
    } catch (err) {
      if (err instanceof MergeSuggestionNotPendingError) {
        throw httpError(HttpStatus.CONFLICT, "SUGGESTION_NOT_PENDING", err.message);
      }
      throw err;
    }

    await this.auditLogService.log({
      workspaceId: claims.workspaceId,
      actorUserId: claims.sub,
      actorType: "user",
      action: "identity.merge.approved",
      resourceType: "contact",
      resourceId: result.primaryContactId,
      metadata: { mergedContactId: result.mergedContactId, suggestionId: suggestion.id, confidenceScore: suggestion.confidenceScore },
    });

    return result;
  }

  @Post("merge-suggestions/:id/reject")
  @UseGuards(JwtAuthGuard)
  async reject(@Param("id") id: string, @CurrentUser() claims: JwtPayload) {
    await this.requireOwnSuggestion(id, claims.workspaceId);

    try {
      await rejectMergeSuggestion(id, claims.sub);
    } catch (err) {
      if (err instanceof MergeSuggestionNotPendingError) {
        throw httpError(HttpStatus.CONFLICT, "SUGGESTION_NOT_PENDING", err.message);
      }
      throw err;
    }

    await this.auditLogService.log({
      workspaceId: claims.workspaceId,
      actorUserId: claims.sub,
      actorType: "user",
      action: "identity.merge.rejected",
      resourceType: "identity_merge_suggestion",
      resourceId: id,
    });

    return { id, status: "rejected" };
  }

  private async requireOwnSuggestion(id: string, workspaceId: string) {
    const prisma = getPrismaClient();
    const suggestion = await prisma.identityMergeSuggestion.findFirst({ where: { id, workspaceId } });
    if (!suggestion) {
      throw httpError(HttpStatus.NOT_FOUND, "SUGGESTION_NOT_FOUND", "Merge suggestion not found.");
    }
    return suggestion;
  }
}
