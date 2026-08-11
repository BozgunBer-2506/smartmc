import { getPrismaClient, type LinkedAccount } from "@smc/database";

/**
 * The soft-delete-aware "already connected?" check every connector's
 * connect flow needs (docs/ROADMAP.md Phase 21.1). Every connector
 * (Telegram, Discord, Slack, Email) previously ran this exact query
 * without `deletedAt: null`, so a `LinkedAccount` row from a prior
 * disconnect (or a failed connect attempt left mid-state) permanently
 * blocked reconnecting the same external account, forever reporting
 * "already connected" even though nothing active actually existed -
 * found live during Slack verification and the encryption-key rotation
 * (docs/STATUS.md), fixed here once, shared, rather than re-fixed
 * separately in each of the four call sites it existed in.
 */
export function findActiveLinkedAccount(
  prisma: ReturnType<typeof getPrismaClient>,
  params: { workspaceId: string; providerId: string; externalAccountId: string },
): Promise<LinkedAccount | null> {
  return prisma.linkedAccount.findFirst({
    where: {
      workspaceId: params.workspaceId,
      providerId: params.providerId,
      externalAccountId: params.externalAccountId,
      deletedAt: null,
    },
  });
}
