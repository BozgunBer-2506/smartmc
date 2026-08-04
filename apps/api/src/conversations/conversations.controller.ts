import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { defaultConnectorRegistry, type Connector } from "@smc/connector-sdk";
import { getPrismaClient, newId } from "@smc/database";
import { AuditLogService } from "../audit/audit-log.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";
import { buildPage, decodeCursor, parseLimit, parseOrder, parseSortBy, type SortDirection } from "../common/cursor-pagination";
import { CredentialsStoreService } from "../credentials-store/credentials-store.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { SchedulerService } from "../automation/scheduler.service";

/**
 * The inbox read path (docs/ROADMAP.md Phase 3, docs/API.md Section 10.3).
 * Implemented as REST, not GraphQL - ADR-0015 records why: API.md frames
 * the inbox read path as "primarily GraphQL" (ADR-0003), but no GraphQL
 * server exists yet, and standing one up now would be new infrastructure
 * this phase's scope explicitly rules out. This is a scoped, documented
 * deviation, not a silent one.
 */
interface SendMessageDto {
  body?: string;
}

interface UpdateConversationDto {
  isArchived?: boolean;
  category?: string | null;
}

interface ListConversationsQuery {
  archived?: string;
  category?: string;
  vip?: string;
  unread?: string;
  limit?: string;
  cursor?: string;
  sortBy?: string;
  order?: string;
}

/**
 * docs/ROADMAP.md Phase 20.3 - GET /v1/conversations' `?sortBy=` allowlist.
 * Deliberately excludes `priorityScore`, which drives the *default* (no
 * `sortBy`) ranking instead - see `ConversationListCursor` below.
 */
const CONVERSATION_SORT_FIELDS = ["lastMessageAt", "createdAt"] as const;
type ConversationSortField = (typeof CONVERSATION_SORT_FIELDS)[number];
const CONVERSATION_DEFAULT_ORDER: Record<ConversationSortField, SortDirection> = { lastMessageAt: "desc", createdAt: "desc" };

/**
 * Two shapes in one cursor type, same pattern as RuleListCursor: no
 * `sortBy` means the default compound (priorityScore desc, lastMessageAt
 * desc, id desc) order, unchanged from Phase 20.2; a `sortBy` present
 * means a single-field keyset walk instead. `lastMessageAt` is nullable
 * (a conversation with no messages yet), so its own sortBy mode needs
 * null-aware keyset logic - see `lastMessageAtKeyset` below.
 */
interface ConversationListCursor {
  sortBy?: ConversationSortField;
  order?: SortDirection;
  priorityScore?: number;
  lastMessageAt?: string | null;
  value?: string;
  id: string;
}

interface MessageCursor {
  receivedAt: string;
  id: string;
}

/**
 * `lastMessageAt` is nullable, so its keyset WHERE can't reuse the generic
 * `keysetOr` (which assumes a non-null, single-typed value). Matches
 * Postgres' own default null ordering (nulls sort last in ASC, first in
 * DESC - explicitly requested via Prisma's `nulls` orderBy option below,
 * not left implicit) so the WHERE clause and the ORDER BY agree.
 */
function lastMessageAtKeyset(order: SortDirection, value: string | null, id: string) {
  if (order === "desc") {
    // nulls first, then non-null rows newest-first.
    if (value === null) return { OR: [{ lastMessageAt: null, id: { lt: id } }, { lastMessageAt: { not: null } }] };
    return { OR: [{ lastMessageAt: { lt: new Date(value) } }, { AND: [{ lastMessageAt: new Date(value) }, { id: { lt: id } }] }] };
  }
  // asc: non-null rows oldest-first, then nulls.
  if (value === null) return { lastMessageAt: null, id: { gt: id } };
  return {
    OR: [
      { lastMessageAt: { gt: new Date(value) } },
      { AND: [{ lastMessageAt: new Date(value) }, { id: { gt: id } }] },
      { lastMessageAt: null },
    ],
  };
}

/** True/false unread state: null lastReadAt means every message is unread; otherwise unread iff a message arrived after the last read timestamp. */
function isUnread(conversation: { lastMessageAt: Date | null; lastReadAt: Date | null }): boolean {
  if (!conversation.lastMessageAt) return false;
  if (!conversation.lastReadAt) return true;
  return conversation.lastMessageAt > conversation.lastReadAt;
}

/** The trustworthy "Needs You" signal (docs/PRODUCT.md UI Principles: "must be trustworthy") - unread AND (VIP sender or a high enough priority score), never raw unread count. */
const NEEDS_YOU_PRIORITY_THRESHOLD = 30;

@Controller("conversations")
export class ConversationsController {
  constructor(
    private readonly realtime: RealtimeGateway,
    private readonly credentialsStore: CredentialsStoreService,
    private readonly auditLogService: AuditLogService,
    private readonly scheduler: SchedulerService,
  ) {}

  /**
   * The unified inbox view (docs/ROADMAP.md Phase 9) - every connected
   * provider's conversations in one feed, filterable by archive state,
   * category, VIP sender, and unread state ("Filters" checklist item).
   * VIP/unread filtering happens after the query (not in Prisma's `where`)
   * since both depend on the joined last-message/sender, not a plain
   * column - correct at this product's current scale, a real, disclosed
   * simplification if conversation volume ever makes that costly
   * (docs/reviews/phase-9-review.md).
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() claims: JwtPayload, @Query() query: ListConversationsQuery) {
    const prisma = getPrismaClient();
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<ConversationListCursor>(query.cursor);

    // The cursor is the source of truth once present. No cursor yet: an
    // explicit `?sortBy=` switches into single-field mode; otherwise stay
    // on the default compound (priorityScore, lastMessageAt) order.
    const sortBy = cursor ? cursor.sortBy : query.sortBy ? parseSortBy(query.sortBy, CONVERSATION_SORT_FIELDS, "lastMessageAt") : undefined;
    const order = sortBy ? (cursor?.order ?? parseOrder(query.order, CONVERSATION_DEFAULT_ORDER[sortBy])) : undefined;

    let cursorWhere: Record<string, unknown> = {};
    if (cursor) {
      if (sortBy === "lastMessageAt") {
        cursorWhere = lastMessageAtKeyset(order!, cursor.value ?? null, cursor.id);
      } else if (sortBy === "createdAt") {
        const cmp = order === "desc" ? "lt" : "gt";
        cursorWhere = { OR: [{ createdAt: { [cmp]: new Date(cursor.value!) } }, { AND: [{ createdAt: new Date(cursor.value!) }, { id: { [cmp]: cursor.id } }] }] };
      } else {
        cursorWhere = {
          OR: [
            { priorityScore: { lt: cursor.priorityScore } },
            {
              priorityScore: cursor.priorityScore,
              ...(cursor.lastMessageAt
                ? {
                    OR: [
                      { lastMessageAt: { lt: new Date(cursor.lastMessageAt) } },
                      { lastMessageAt: new Date(cursor.lastMessageAt), id: { lt: cursor.id } },
                    ],
                  }
                : { lastMessageAt: null, id: { lt: cursor.id } }),
            },
          ],
        };
      }
    }

    const orderBy =
      sortBy === "lastMessageAt"
        ? [{ lastMessageAt: { sort: order!, nulls: order === "desc" ? ("first" as const) : ("last" as const) } }, { id: order! }]
        : sortBy === "createdAt"
          ? [{ createdAt: order! }, { id: order! }]
          : [{ priorityScore: "desc" as const }, { lastMessageAt: "desc" as const }, { id: "desc" as const }];

    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId: claims.workspaceId,
        isArchived: query.archived === "true" ? true : query.archived === "false" ? false : undefined,
        category: query.category ?? undefined,
        ...cursorWhere,
      },
      orderBy,
      take: limit + 1,
      include: {
        provider: true,
        messages: {
          orderBy: { receivedAt: "desc" },
          take: 1,
          include: { sender: true },
        },
      },
    });

    const page = buildPage(conversations, limit, (last) =>
      sortBy && order
        ? {
            sortBy,
            order,
            value: sortBy === "lastMessageAt" ? (last.lastMessageAt ? last.lastMessageAt.toISOString() : null) : last.createdAt.toISOString(),
            id: last.id,
          }
        : {
            priorityScore: last.priorityScore,
            lastMessageAt: last.lastMessageAt ? last.lastMessageAt.toISOString() : null,
            id: last.id,
          },
    );

    // VIP/unread filtering still happens after the query, not in Prisma's
    // `where` (pre-existing, disclosed simplification - docs/reviews/
    // phase-9-review.md), which means `pagination.hasMore`/`nextCursor`
    // describe the underlying unfiltered page, not the filtered result
    // actually returned - a filtered page can legitimately come back
    // shorter than `limit` even when more matching rows exist further in.
    // Carried forward as-is, not a regression cursor pagination introduced.
    const data = page.data
      .map((conversation) => {
        const lastMessage = conversation.messages[0];
        return {
          id: conversation.id,
          title: conversation.title,
          providerKey: conversation.provider.key,
          lastMessageAt: conversation.lastMessageAt,
          priorityScore: conversation.priorityScore,
          isArchived: conversation.isArchived,
          category: conversation.category,
          unread: isUnread(conversation),
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
      })
      .filter((conversation) => {
        if (query.vip === "true" && !conversation.lastMessage?.sender?.isVip) return false;
        if (query.unread === "true" && !conversation.unread) return false;
        return true;
      });

    return { data, pagination: page.pagination };
  }

  /** The trustworthy "Needs You" count (docs/PRODUCT.md UI Principles) - computed from priority rules, never a raw unread badge. */
  @Get("summary")
  @UseGuards(JwtAuthGuard)
  async summary(@CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();
    const conversations = await prisma.conversation.findMany({
      where: { workspaceId: claims.workspaceId, isArchived: false },
      include: { messages: { orderBy: { receivedAt: "desc" }, take: 1, include: { sender: true } } },
    });

    const needsYouCount = conversations.filter((conversation) => {
      if (!isUnread(conversation)) return false;
      const sender = conversation.messages[0]?.sender;
      return Boolean(sender?.isVip) || conversation.priorityScore >= NEEDS_YOU_PRIORITY_THRESHOLD;
    }).length;

    return { needsYouCount };
  }

  /** Archive/unarchive and manual categorization ("Archive"/"Categories" checklist items) - both user-set, no auto-categorization yet (disclosed in docs/reviews/phase-9-review.md). */
  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  async update(@Param("id") id: string, @Body() dto: UpdateConversationDto, @CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();
    const conversation = await prisma.conversation.findFirst({ where: { id, workspaceId: claims.workspaceId } });
    if (!conversation) {
      throw httpError(HttpStatus.NOT_FOUND, "CONVERSATION_NOT_FOUND", "Conversation not found.");
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        isArchived: dto.isArchived ?? undefined,
        category: dto.category === undefined ? undefined : dto.category,
      },
    });

    return { id: updated.id, isArchived: updated.isArchived, category: updated.category };
  }

  /** Marks every message in the conversation read as of now - the "Unread manager" checklist item's write path. */
  @Post(":id/read")
  @UseGuards(JwtAuthGuard)
  async markRead(@Param("id") id: string, @CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();
    const conversation = await prisma.conversation.findFirst({ where: { id, workspaceId: claims.workspaceId } });
    if (!conversation) {
      throw httpError(HttpStatus.NOT_FOUND, "CONVERSATION_NOT_FOUND", "Conversation not found.");
    }

    const updated = await prisma.conversation.update({ where: { id }, data: { lastReadAt: new Date() } });
    return { id: updated.id, lastReadAt: updated.lastReadAt };
  }

  @Get(":id/messages")
  @UseGuards(JwtAuthGuard)
  async messages(
    @Param("id") id: string,
    @CurrentUser() claims: JwtPayload,
    @Query("limit") limitParam?: string,
    @Query("cursor") cursorParam?: string,
  ) {
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

    const limit = parseLimit(limitParam);
    const cursor = decodeCursor<MessageCursor>(cursorParam);

    // Queried newest-first (a real chat's useful default is the most
    // recent messages, not the oldest) - "next page" via cursor walks
    // backwards to earlier messages, matching a real "load earlier
    // messages" chat UI. Reversed back to chronological order below
    // before returning, so a single unpaginated page still reads top-to-
    // bottom oldest-to-newest exactly as before this change.
    const messages = await prisma.message.findMany({
      where: {
        conversationId: id,
        ...(cursor
          ? { OR: [{ receivedAt: { lt: new Date(cursor.receivedAt) } }, { receivedAt: new Date(cursor.receivedAt), id: { lt: cursor.id } }] }
          : {}),
      },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: { sender: true },
    });

    const page = buildPage(messages, limit, (last) => ({ receivedAt: last.receivedAt.toISOString(), id: last.id }));
    return {
      ...page,
      data: page.data
        .slice()
        .reverse()
        .map((message) => ({
          id: message.id,
          direction: message.direction,
          bodyText: message.bodyText,
          receivedAt: message.receivedAt,
          sender: message.sender
            ? { id: message.sender.id, displayName: message.sender.displayName, isVip: message.sender.isVip }
            : null,
        })),
    };
  }

  /**
   * The reply path (docs/ROADMAP.md Phase 4 Sprint 2, docs/API.md Section
   * 10.3's `POST /v1/conversations/{id}/messages`). Disclosed simplification
   * vs. API.md's documented `202 Accepted` + async-delivery-over-WebSocket
   * shape: this sends synchronously and returns `201` once Telegram has
   * actually accepted the message, since Sprint 2 has no outbound event
   * processor yet - see docs/reviews/phase-4-sprint-2-review.md.
   */
  @Post(":id/messages")
  @UseGuards(JwtAuthGuard)
  async sendMessage(@Param("id") id: string, @Body() dto: SendMessageDto, @CurrentUser() claims: JwtPayload) {
    if (!dto.body || typeof dto.body !== "string" || dto.body.trim().length === 0) {
      throw httpError(HttpStatus.BAD_REQUEST, "BODY_REQUIRED", "A message body is required.");
    }

    const prisma = getPrismaClient();
    const conversation = await prisma.conversation.findFirst({
      where: { id, workspaceId: claims.workspaceId },
      include: { linkedAccount: true, provider: true },
    });
    if (!conversation) {
      throw httpError(HttpStatus.NOT_FOUND, "CONVERSATION_NOT_FOUND", "Conversation not found.");
    }
    if (!conversation.linkedAccount) {
      throw httpError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "LINKED_ACCOUNT_NOT_AVAILABLE",
        "This conversation has no connected account to send through.",
      );
    }
    if (conversation.linkedAccount.deletedAt || conversation.linkedAccount.status === "reauth_required") {
      throw httpError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "LINKED_ACCOUNT_REAUTH_REQUIRED",
        "The connected account needs to be reauthorized before sending.",
      );
    }

    const connector = defaultConnectorRegistry.get(conversation.provider.key) as Connector;
    if (!connector.send) {
      throw httpError(
        HttpStatus.NOT_IMPLEMENTED,
        "SEND_NOT_SUPPORTED",
        `Sending is not yet supported for provider "${conversation.provider.key}".`,
      );
    }

    const token = await this.credentialsStore.getSecret(conversation.linkedAccount.credentialsRef);
    let sendResult;
    try {
      sendResult = await connector.send(
        { conversationExternalId: conversation.externalId, bodyText: dto.body },
        { credential: token, linkedAccountId: conversation.linkedAccount.id },
      );
    } catch (err) {
      throw httpError(HttpStatus.BAD_GATEWAY, "SEND_FAILED", err instanceof Error ? err.message : "Failed to send message.");
    }

    const message = await prisma.message.create({
      data: {
        id: newId(),
        workspaceId: claims.workspaceId,
        conversationId: conversation.id,
        externalId: sendResult.externalId,
        senderContactId: null,
        direction: "outbound",
        bodyText: dto.body,
        receivedAt: new Date(),
      },
    });

    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.receivedAt } });

    this.realtime.emitToWorkspace(claims.workspaceId, "message.sent", {
      id: message.id,
      conversationId: conversation.id,
      conversationTitle: conversation.title,
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
    });

    await this.auditLogService.log({
      workspaceId: claims.workspaceId,
      actorUserId: claims.sub,
      actorType: "user",
      action: "message.sent",
      resourceType: "message",
      resourceId: message.id,
      metadata: { conversationId: conversation.id, providerKey: conversation.provider.key },
    });

    // A manual reply is exactly the event a `time.no_reply_after` rule was
    // waiting to not happen - cancel any pending job for this conversation
    // (docs/AUTOMATION_ENGINE.md Section 3.3).
    await this.scheduler.cancelNoReplyRules(claims.workspaceId, conversation.id);

    return {
      id: message.id,
      direction: message.direction,
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
    };
  }
}
