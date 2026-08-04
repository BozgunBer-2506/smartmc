import { Controller, Get, HttpStatus, Param, Post, Query, UseGuards } from "@nestjs/common";
import { getPrismaClient } from "@smc/database";
import { approveMergeSuggestion, MergeSuggestionNotPendingError, rejectMergeSuggestion } from "@smc/identity";
import { AuditLogService } from "../audit/audit-log.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";
import { buildPage, decodeCursor, parseLimit } from "../common/cursor-pagination";

interface MergeSuggestionCursor {
  createdAt: string;
  id: string;
}

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
  async listSuggestions(@CurrentUser() claims: JwtPayload, @Query("limit") limitParam?: string, @Query("cursor") cursorParam?: string) {
    const prisma = getPrismaClient();
    const limit = parseLimit(limitParam);
    const cursor = decodeCursor<MergeSuggestionCursor>(cursorParam);

    const suggestions = await prisma.identityMergeSuggestion.findMany({
      where: {
        workspaceId: claims.workspaceId,
        status: "pending",
        ...(cursor
          ? { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const page = buildPage(suggestions, limit, (last) => ({ createdAt: last.createdAt.toISOString(), id: last.id }));

    const contactIds = [...new Set(page.data.flatMap((s) => [s.candidateContactIdA, s.candidateContactIdB]))];
    const contacts = await prisma.contact.findMany({ where: { id: { in: contactIds } } });
    const contactById = new Map(contacts.map((c) => [c.id, c]));

    return {
      ...page,
      data: page.data.map((suggestion) => ({
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
      })),
    };
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
