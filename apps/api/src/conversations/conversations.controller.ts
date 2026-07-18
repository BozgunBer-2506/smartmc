import { Controller, Get, HttpStatus, Param, UseGuards } from "@nestjs/common";
import { getPrismaClient } from "@smc/database";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";

/**
 * The inbox read path (docs/ROADMAP.md Phase 3, docs/API.md Section 10.3).
 * Implemented as REST, not GraphQL - ADR-0015 records why: API.md frames
 * the inbox read path as "primarily GraphQL" (ADR-0003), but no GraphQL
 * server exists yet, and standing one up now would be new infrastructure
 * this phase's scope explicitly rules out. This is a scoped, documented
 * deviation, not a silent one.
 */
@Controller("conversations")
export class ConversationsController {
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();

    const conversations = await prisma.conversation.findMany({
      where: { workspaceId: claims.workspaceId },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      include: {
        provider: true,
        messages: {
          orderBy: { receivedAt: "desc" },
          take: 1,
          include: { sender: true },
        },
      },
    });

    return conversations.map((conversation) => {
      const lastMessage = conversation.messages[0];
      return {
        id: conversation.id,
        title: conversation.title,
        providerKey: conversation.provider.key,
        lastMessageAt: conversation.lastMessageAt,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              bodyText: lastMessage.bodyText,
              direction: lastMessage.direction,
              receivedAt: lastMessage.receivedAt,
              sender: lastMessage.sender
                ? {
                    id: lastMessage.sender.id,
                    displayName: lastMessage.sender.displayName,
                    isVip: lastMessage.sender.isVip,
                  }
                : null,
            }
          : null,
      };
    });
  }

  @Get(":id/messages")
  @UseGuards(JwtAuthGuard)
  async messages(@Param("id") id: string, @CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();

    // Workspace-ownership check before returning any message - a
    // conversation belonging to a different workspace is reported as
    // 404, never 403 (SECURITY.md's existence-sensitivity policy: a
    // multi-tenant resource's existence is itself sensitive information).
    const conversation = await prisma.conversation.findFirst({
      where: { id, workspaceId: claims.workspaceId },
    });

    if (!conversation) {
      throw httpError(HttpStatus.NOT_FOUND, "CONVERSATION_NOT_FOUND", "Conversation not found.");
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { receivedAt: "asc" },
      include: { sender: true },
    });

    return messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
      sender: message.sender
        ? { id: message.sender.id, displayName: message.sender.displayName, isVip: message.sender.isVip }
        : null,
    }));
  }
}
