import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { getPrismaClient } from "@smc/database";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { buildPage, decodeCursor, parseLimit } from "../common/cursor-pagination";

interface NotificationCursor {
  createdAt: string;
  id: string;
}

/**
 * docs/API.md Section 10.7 - GET /v1/notifications. Simplified from the
 * full spec (?unreadOnly filter, an authoritative unreadCount,
 * read/mark-all-read endpoints) since `Notification` has no `readAt`
 * column yet (docs/DATABASE.md Section 6.14 specifies one; not added
 * here per "don't build ahead of need" - there's no read-tracking
 * feature yet to back it). Recorded as a disclosed Phase 3 simplification,
 * not a silent gap - see docs/reviews/phase-3-review.md. Cursor
 * pagination itself is real (ROADMAP.md Phase 20.2).
 */
@Controller("notifications")
export class NotificationsController {
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() claims: JwtPayload, @Query("limit") limitParam?: string, @Query("cursor") cursorParam?: string) {
    const prisma = getPrismaClient();
    const limit = parseLimit(limitParam);
    const cursor = decodeCursor<NotificationCursor>(cursorParam);

    const notifications = await prisma.notification.findMany({
      where: {
        workspaceId: claims.workspaceId,
        ...(cursor
          ? { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const page = buildPage(notifications, limit, (last) => ({ createdAt: last.createdAt.toISOString(), id: last.id }));
    return {
      ...page,
      data: page.data.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        messageId: notification.messageId,
        createdAt: notification.createdAt,
      })),
    };
  }
}
