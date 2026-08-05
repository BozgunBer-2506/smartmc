import { Body, Controller, Get, Headers, HttpStatus, Patch, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { getPrismaClient, newId } from "@smc/database";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";
import { etagFor, parseETagHeader } from "../common/etag";

/** The ETag for the synthesized "no row persisted yet" default (docs/ROADMAP.md Phase 20.4) - distinct from any real version number so a stale client can't accidentally match it. */
const NOT_YET_CREATED_ETAG = "new";

interface UpdatePreferencesDto {
  silentHoursStart?: string | null;
  silentHoursEnd?: string | null;
  vipOverrideEnabled?: boolean;
  keywordAlerts?: string[];
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * `docs/API.md` Section 10: `GET`/`PATCH /v1/notification-preferences`
 * (`docs/DATABASE.md` Section 6.14) - silent hours, VIP override, keyword
 * alerts. Self-only, per API.md's explicit deviation from the usual
 * admin-can-manage-workspace pattern: a notification preference is
 * personal, never settable on someone else's behalf even by an owner.
 */
@Controller("notification-preferences")
@UseGuards(JwtAuthGuard)
export class NotificationPreferencesController {
  @Get()
  async get(
    @CurrentUser() claims: JwtPayload,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const prisma = getPrismaClient();
    const existing = await prisma.notificationPreference.findUnique({
      where: { uq_notification_preferences_workspace_user: { workspaceId: claims.workspaceId, userId: claims.sub } },
    });

    const etag = existing ? etagFor(existing.version) : etagFor(NOT_YET_CREATED_ETAG);
    response.setHeader("ETag", etag);
    if (parseETagHeader(ifNoneMatch) === (existing ? String(existing.version) : NOT_YET_CREATED_ETAG)) {
      response.status(HttpStatus.NOT_MODIFIED);
      return undefined;
    }

    if (existing) return existing;

    // No row yet - defaults, not yet persisted (persisted on first PATCH, avoiding a write on every plain GET).
    return {
      id: null,
      workspaceId: claims.workspaceId,
      userId: claims.sub,
      silentHoursStart: null,
      silentHoursEnd: null,
      vipOverrideEnabled: true,
      keywordAlerts: [],
    };
  }

  /**
   * `If-Match` is required (docs/API.md Section 8, ROADMAP.md Phase 20.4),
   * replacing the previous blind `upsert` (no conflict detection at all).
   * A client that has never fetched this resource sends `If-Match: "new"`
   * to create it for the first time; `If-Match: "<version>"` to update an
   * existing row, checked atomically the same way `RulesController.update`
   * does. A stale `"new"` (someone else already created the row) or a
   * stale version number both come back as `412 Precondition Failed`.
   */
  @Patch()
  async update(
    @Body() dto: UpdatePreferencesDto,
    @CurrentUser() claims: JwtPayload,
    @Headers("if-match") ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const expectedVersion = parseETagHeader(ifMatch);
    if (expectedVersion === null) {
      throw httpError(
        HttpStatus.PRECONDITION_REQUIRED,
        "PRECONDITION_REQUIRED",
        'An If-Match header is required to update notification preferences (use "new" if none exist yet).',
      );
    }

    for (const value of [dto.silentHoursStart, dto.silentHoursEnd]) {
      if (value != null && !TIME_PATTERN.test(value)) {
        throw httpError(HttpStatus.BAD_REQUEST, "INVALID_TIME_FORMAT", "Silent hours must be in HH:mm 24-hour format.");
      }
    }
    if (dto.keywordAlerts && !Array.isArray(dto.keywordAlerts)) {
      throw httpError(HttpStatus.BAD_REQUEST, "INVALID_KEYWORD_ALERTS", "keywordAlerts must be an array of strings.");
    }

    const prisma = getPrismaClient();
    const filter = { workspaceId: claims.workspaceId, userId: claims.sub };
    const key = { uq_notification_preferences_workspace_user: filter };
    const existing = await prisma.notificationPreference.findUnique({ where: key });

    if (!existing) {
      if (expectedVersion !== NOT_YET_CREATED_ETAG) {
        throw httpError(HttpStatus.PRECONDITION_FAILED, "OPTIMISTIC_LOCK_FAILURE", "No notification preferences exist yet - retry with an If-Match of \"new\".");
      }
      const created = await prisma.notificationPreference.create({
        data: {
          id: newId(),
          workspaceId: claims.workspaceId,
          userId: claims.sub,
          silentHoursStart: dto.silentHoursStart ?? null,
          silentHoursEnd: dto.silentHoursEnd ?? null,
          vipOverrideEnabled: dto.vipOverrideEnabled ?? true,
          keywordAlerts: dto.keywordAlerts ?? [],
        },
      });
      response.setHeader("ETag", etagFor(created.version));
      return created;
    }

    const expectedVersionNumber = Number(expectedVersion);
    const result = await prisma.notificationPreference.updateMany({
      where: { ...filter, version: Number.isInteger(expectedVersionNumber) ? expectedVersionNumber : -1 },
      data: {
        ...(dto.silentHoursStart !== undefined && { silentHoursStart: dto.silentHoursStart }),
        ...(dto.silentHoursEnd !== undefined && { silentHoursEnd: dto.silentHoursEnd }),
        ...(dto.vipOverrideEnabled !== undefined && { vipOverrideEnabled: dto.vipOverrideEnabled }),
        ...(dto.keywordAlerts !== undefined && { keywordAlerts: dto.keywordAlerts }),
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      const current = await prisma.notificationPreference.findUniqueOrThrow({ where: key });
      response.setHeader("ETag", etagFor(current.version));
      throw httpError(
        HttpStatus.PRECONDITION_FAILED,
        "OPTIMISTIC_LOCK_FAILURE",
        `Notification preferences were edited elsewhere (current version is ${current.version}) - reload and try again.`,
      );
    }

    const updated = await prisma.notificationPreference.findUniqueOrThrow({ where: key });
    response.setHeader("ETag", etagFor(updated.version));
    return updated;
  }
}
