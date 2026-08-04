import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { getPrismaClient } from "@smc/database";
import { ContactNotFoundError, NoIdentitiesToSplitError, splitContact } from "@smc/identity";
import { AuditLogService } from "../audit/audit-log.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";
import { buildPage, decodeCursor, parseLimit } from "../common/cursor-pagination";

interface UpdateContactDto {
  isVip?: boolean;
}

interface ContactListCursor {
  displayName: string;
  id: string;
}

interface SplitContactDto {
  contactIdentityIds?: string[];
  reason?: string;
}

/**
 * VIP tagging (docs/PRODUCT.md "VIP & Priority Handling") and manual
 * contact split (docs/ARCHITECTURE.md Section 13.6.1's recovery action for
 * an incorrect merge). Contact.isVip already existed in the schema since
 * Phase 3 (unused until this phase gave it a real read/write surface).
 */
@Controller("contacts")
export class ContactsController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() claims: JwtPayload, @Query("limit") limitParam?: string, @Query("cursor") cursorParam?: string) {
    const prisma = getPrismaClient();
    const limit = parseLimit(limitParam);
    const cursor = decodeCursor<ContactListCursor>(cursorParam);

    const contacts = await prisma.contact.findMany({
      where: {
        workspaceId: claims.workspaceId,
        ...(cursor
          ? { OR: [{ displayName: { gt: cursor.displayName } }, { displayName: cursor.displayName, id: { gt: cursor.id } }] }
          : {}),
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take: limit + 1,
      include: { identities: { include: { provider: true } } },
    });

    const page = buildPage(contacts, limit, (last) => ({ displayName: last.displayName, id: last.id }));
    return {
      ...page,
      data: page.data.map((contact) => ({
        id: contact.id,
        displayName: contact.displayName,
        isVip: contact.isVip,
        identities: contact.identities.map((identity) => ({
          id: identity.id,
          providerKey: identity.provider.key,
          handle: identity.handle,
          matchType: identity.matchType,
        })),
      })),
    };
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  async update(@Param("id") id: string, @Body() dto: UpdateContactDto, @CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();
    const contact = await prisma.contact.findFirst({ where: { id, workspaceId: claims.workspaceId } });
    if (!contact) {
      throw httpError(HttpStatus.NOT_FOUND, "CONTACT_NOT_FOUND", "Contact not found.");
    }

    const updated = await prisma.contact.update({ where: { id }, data: { isVip: dto.isVip ?? undefined } });

    if (dto.isVip !== undefined && dto.isVip !== contact.isVip) {
      await this.auditLogService.log({
        workspaceId: claims.workspaceId,
        actorUserId: claims.sub,
        actorType: "user",
        action: dto.isVip ? "contact.vip.enabled" : "contact.vip.disabled",
        resourceType: "contact",
        resourceId: id,
      });
    }

    return { id: updated.id, displayName: updated.displayName, isVip: updated.isVip };
  }

  /** The recovery action for an incorrect merge (ARCHITECTURE.md Section 13.6.1) - first-class and immediately available, not a support escalation. */
  @Post(":id/split")
  @UseGuards(JwtAuthGuard)
  async split(@Param("id") id: string, @Body() dto: SplitContactDto, @CurrentUser() claims: JwtPayload) {
    if (!Array.isArray(dto.contactIdentityIds) || dto.contactIdentityIds.length === 0) {
      throw httpError(HttpStatus.BAD_REQUEST, "IDENTITIES_REQUIRED", "At least one contactIdentityId to split off is required.");
    }

    const prisma = getPrismaClient();
    const contact = await prisma.contact.findFirst({ where: { id, workspaceId: claims.workspaceId } });
    if (!contact) {
      throw httpError(HttpStatus.NOT_FOUND, "CONTACT_NOT_FOUND", "Contact not found.");
    }

    let result;
    try {
      result = await splitContact({
        contactId: id,
        workspaceId: claims.workspaceId,
        contactIdentityIds: dto.contactIdentityIds,
        splitByUserId: claims.sub,
        reason: dto.reason,
      });
    } catch (err) {
      if (err instanceof ContactNotFoundError || err instanceof NoIdentitiesToSplitError) {
        throw httpError(HttpStatus.UNPROCESSABLE_ENTITY, "SPLIT_FAILED", err.message);
      }
      throw err;
    }

    await this.auditLogService.log({
      workspaceId: claims.workspaceId,
      actorUserId: claims.sub,
      actorType: "user",
      action: "identity.split",
      resourceType: "contact",
      resourceId: id,
      metadata: { newContactId: result.newContactId, reason: dto.reason ?? null },
    });

    return result;
  }
}
