import { Controller, Get, UseGuards } from "@nestjs/common";
import { getPrismaClient } from "@smc/database";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";

/**
 * docs/API.md Section 10.7 - GET /v1/notifications. Simplified from the
 * full spec (cursor pagination, ?unreadOnly filter, an authoritative
 * unreadCount, read/mark-all-read endpoints) since `Notification` has no
 * `readAt` column yet (docs/DATABASE.md Section 6.14 specifies one; not
 * added here per "don't build ahead of need" - there's no read-tracking
 * feature yet to back it). Recorded as a disclosed Phase 3 simplification,
 * not a silent gap - see docs/reviews/phase-3-review.md.
 */
@Controller("notifications")
export class NotificationsController {
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();

    const notifications = await prisma.notification.findMany({
      where: { workspaceId: claims.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      messageId: notification.messageId,
      createdAt: notification.createdAt,
    }));
  }
}
