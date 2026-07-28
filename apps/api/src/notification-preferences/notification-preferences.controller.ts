import { Body, Controller, Get, HttpStatus, Patch, UseGuards } from "@nestjs/common";
import { getPrismaClient, newId } from "@smc/database";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";

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
  async get(@CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();
    const existing = await prisma.notificationPreference.findUnique({
      where: { uq_notification_preferences_workspace_user: { workspaceId: claims.workspaceId, userId: claims.sub } },
    });
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

  @Patch()
  async update(@Body() dto: UpdatePreferencesDto, @CurrentUser() claims: JwtPayload) {
    for (const value of [dto.silentHoursStart, dto.silentHoursEnd]) {
      if (value != null && !TIME_PATTERN.test(value)) {
        throw httpError(HttpStatus.BAD_REQUEST, "INVALID_TIME_FORMAT", "Silent hours must be in HH:mm 24-hour format.");
      }
    }
    if (dto.keywordAlerts && !Array.isArray(dto.keywordAlerts)) {
      throw httpError(HttpStatus.BAD_REQUEST, "INVALID_KEYWORD_ALERTS", "keywordAlerts must be an array of strings.");
    }

    const prisma = getPrismaClient();
    return prisma.notificationPreference.upsert({
      where: { uq_notification_preferences_workspace_user: { workspaceId: claims.workspaceId, userId: claims.sub } },
      update: {
        ...(dto.silentHoursStart !== undefined && { silentHoursStart: dto.silentHoursStart }),
        ...(dto.silentHoursEnd !== undefined && { silentHoursEnd: dto.silentHoursEnd }),
        ...(dto.vipOverrideEnabled !== undefined && { vipOverrideEnabled: dto.vipOverrideEnabled }),
        ...(dto.keywordAlerts !== undefined && { keywordAlerts: dto.keywordAlerts }),
      },
      create: {
        id: newId(),
        workspaceId: claims.workspaceId,
        userId: claims.sub,
        silentHoursStart: dto.silentHoursStart ?? null,
        silentHoursEnd: dto.silentHoursEnd ?? null,
        vipOverrideEnabled: dto.vipOverrideEnabled ?? true,
        keywordAlerts: dto.keywordAlerts ?? [],
      },
    });
  }
}
