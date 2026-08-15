import { Controller, Get, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";
import { ScheduledMessageService } from "./scheduled-message.service";

/** The list/cancel side of the scheduled-send feature (docs/ROADMAP.md Phase 21.6) - scheduling itself happens via `POST /v1/conversations/{id}/messages` with a future `sendAt`. */
@Controller("scheduled-messages")
@UseGuards(JwtAuthGuard)
export class ScheduledMessagesController {
  constructor(private readonly scheduledMessage: ScheduledMessageService) {}

  @Get()
  async list(@CurrentUser() claims: JwtPayload) {
    const scheduledMessages = await this.scheduledMessage.list(claims.workspaceId);
    return {
      data: scheduledMessages.map((scheduledMessage) => ({
        id: scheduledMessage.id,
        conversationId: scheduledMessage.conversationId,
        bodyText: scheduledMessage.bodyText,
        sendAt: scheduledMessage.sendAt,
        status: scheduledMessage.status,
        sentMessageId: scheduledMessage.sentMessageId,
        lastError: scheduledMessage.lastError,
        createdAt: scheduledMessage.createdAt,
      })),
    };
  }

  @Post(":id/cancel")
  async cancel(@Param("id") id: string, @CurrentUser() claims: JwtPayload) {
    const cancelled = await this.scheduledMessage.cancel(claims.workspaceId, id);
    if (!cancelled) {
      throw httpError(
        HttpStatus.NOT_FOUND,
        "SCHEDULED_MESSAGE_NOT_FOUND",
        "No pending scheduled message found with that id.",
      );
    }
    return { id: cancelled.id, status: cancelled.status };
  }
}
