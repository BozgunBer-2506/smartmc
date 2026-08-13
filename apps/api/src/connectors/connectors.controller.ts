import { Controller, Get, UseGuards } from "@nestjs/common";
import { getPrismaClient } from "@smc/database";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { sanitizeErrorMessage } from "../common/sanitize-error";

/**
 * A single, provider-agnostic view of every connector a workspace has
 * connected (docs/ROADMAP.md Phase 21.2) - the one real gap found while
 * fixing Phase 21.1: there was no way to see a workspace's connectors at
 * all short of a direct database query. One endpoint, not cursor-paginated
 * (same reasoning `GET /v1/auth/sessions` already established - a
 * workspace's own connector list is small and user-owned, disproportionate
 * to paginate) and not split into a separate `/health` endpoint per
 * explicit user direction: a real per-provider network health check (
 * Telegram `getWebhookInfo`, Slack `auth.test`, IMAP `NOOP`) is deferred
 * until there's an actual need for it, not built speculatively now.
 */
@Controller("connectors")
@UseGuards(JwtAuthGuard)
export class ConnectorsController {
  @Get()
  async list(@CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();
    const linkedAccounts = await prisma.linkedAccount.findMany({
      where: { workspaceId: claims.workspaceId },
      include: { provider: true },
      orderBy: [{ createdAt: "desc" }],
    });

    return {
      data: linkedAccounts.map((linkedAccount) => ({
        id: linkedAccount.id,
        provider: linkedAccount.provider.key,
        // Never populated today (docs/ROADMAP.md Phase 21.2's disclosed
        // scope note) - every connector's authenticate() currently
        // returns only accountExternalId, no human-readable label.
        // Surfaced as-is (usually null) rather than fabricated here.
        displayLabel: linkedAccount.displayLabel,
        externalAccountId: linkedAccount.externalAccountId,
        status: linkedAccount.status,
        lastSyncedAt: linkedAccount.lastSyncedAt,
        lastError: sanitizeErrorMessage(linkedAccount.lastError),
        createdAt: linkedAccount.createdAt,
      })),
    };
  }
}
