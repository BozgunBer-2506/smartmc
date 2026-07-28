import { Controller, Get, HttpStatus, Query, UseGuards } from "@nestjs/common";
import { getPrismaClient, Prisma } from "@smc/database";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";

const RESULT_LIMIT = 50;

interface MessageSearchRow {
  id: string;
  conversationId: string;
  bodyText: string;
  receivedAt: Date;
  senderDisplayName: string | null;
  conversationTitle: string | null;
}

/**
 * docs/API.md's search surface - a distinct endpoint per searchable
 * domain, not a `?q=` bolted onto the list endpoints (different
 * pagination/ranking semantics than a plain filtered list). Messages use
 * real Postgres full-text search (docs/DATABASE.md Section 14); Contacts
 * use a simpler case-insensitive substring match, since Section 14 itself
 * only calls full-text search "optional" for `contacts.display_name` - a
 * short proper-noun field doesn't need `tsvector` ranking to be useful.
 *
 * Disclosed simplification vs. Section 14's documented ideal: the search
 * vector is computed live in the query (`to_tsvector(...)`, no persisted
 * `search_vector` generated column or GIN index) - this project has no
 * migrations mechanism beyond `prisma db push` to add a generated column
 * safely, the same reasoning `docs/reviews/phase-9-review.md`'s
 * suggestion-dedup simplification already used. Correct and fast enough
 * at MVP per-workspace message volume; revisit once real volume justifies
 * a maintained column. See docs/reviews/phase-12-review.md.
 */
@Controller("search")
@UseGuards(JwtAuthGuard)
export class SearchController {
  @Get("messages")
  async searchMessages(@Query("q") q: string | undefined, @CurrentUser() claims: JwtPayload) {
    if (!q || q.trim().length === 0) {
      throw httpError(HttpStatus.BAD_REQUEST, "QUERY_REQUIRED", "A search query (?q=) is required.");
    }
    const prisma = getPrismaClient();

    const rows = await prisma.$queryRaw<MessageSearchRow[]>(Prisma.sql`
      SELECT
        m.id AS "id",
        m.conversation_id AS "conversationId",
        m.body_text AS "bodyText",
        m.received_at AS "receivedAt",
        c.display_name AS "senderDisplayName",
        conv.title AS "conversationTitle"
      FROM messages m
      JOIN conversations conv ON conv.id = m.conversation_id
      LEFT JOIN contacts c ON c.id = m.sender_contact_id
      WHERE m.workspace_id = ${claims.workspaceId}::uuid
        AND m.deleted_at IS NULL
        AND to_tsvector('english', coalesce(m.body_text, '') || ' ' || coalesce(c.display_name, '') || ' ' || coalesce(conv.title, ''))
            @@ plainto_tsquery('english', ${q})
      ORDER BY ts_rank(
        to_tsvector('english', coalesce(m.body_text, '') || ' ' || coalesce(c.display_name, '') || ' ' || coalesce(conv.title, '')),
        plainto_tsquery('english', ${q})
      ) DESC
      LIMIT ${RESULT_LIMIT}
    `);

    return rows;
  }

  @Get("contacts")
  async searchContacts(@Query("q") q: string | undefined, @CurrentUser() claims: JwtPayload) {
    if (!q || q.trim().length === 0) {
      throw httpError(HttpStatus.BAD_REQUEST, "QUERY_REQUIRED", "A search query (?q=) is required.");
    }
    const prisma = getPrismaClient();

    return prisma.contact.findMany({
      where: { workspaceId: claims.workspaceId, displayName: { contains: q, mode: "insensitive" } },
      take: RESULT_LIMIT,
      orderBy: { displayName: "asc" },
    });
  }

  /**
   * The cross-domain endpoint API.md flags as "a natural additive
   * endpoint under this same pattern, not a redesign" - just fans out to
   * the two domain-specific searches above and returns both result sets
   * labeled, rather than a single interleaved/ranked list (interleaving
   * message relevance-rank against a plain name match isn't a meaningful
   * single ordering without inventing a cross-domain scoring model this
   * phase doesn't need yet).
   */
  @Get()
  async searchAll(@Query("q") q: string | undefined, @CurrentUser() claims: JwtPayload) {
    const [messages, contacts] = await Promise.all([this.searchMessages(q, claims), this.searchContacts(q, claims)]);
    return { messages, contacts };
  }
}
