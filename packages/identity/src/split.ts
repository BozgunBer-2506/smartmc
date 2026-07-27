import { getPrismaClient, newId } from "@smc/database";

export class ContactNotFoundError extends Error {}
export class NoIdentitiesToSplitError extends Error {}

export interface SplitContactInput {
  contactId: string;
  workspaceId: string;
  /** Which of the contact's ContactIdentity rows move to the new Contact - the rest stay on the original. */
  contactIdentityIds: string[];
  splitByUserId: string;
  reason?: string;
}

/**
 * A first-class, immediately-available recovery action (docs/ARCHITECTURE.md
 * Section 13.6.1 - "even if a user does approve [a merge] in error, a split
 * is a first-class, immediately-available action, not a support escalation").
 * VIP status is carried forward to the new Contact (docs/DATABASE.md
 * Section 6.6's "how shared history divides... is an implementation-level
 * concern" - this session's chosen answer, disclosed in the phase review).
 * Messages move with their originating provider's identity: every message
 * in a conversation on a provider whose ContactIdentity is being split off
 * moves to the new Contact, since a Message has no direct per-sender
 * provider/externalId of its own to join on more precisely than that.
 */
export async function splitContact(input: SplitContactInput): Promise<{ newContactId: string }> {
  const prisma = getPrismaClient();

  const original = await prisma.contact.findUnique({ where: { id: input.contactId } });
  if (!original) throw new ContactNotFoundError(`No Contact with id ${input.contactId}`);

  const identitiesToMove = await prisma.contactIdentity.findMany({
    where: { id: { in: input.contactIdentityIds }, contactId: input.contactId },
  });
  if (identitiesToMove.length === 0) {
    throw new NoIdentitiesToSplitError("None of the given contactIdentityIds belong to this Contact.");
  }

  const newContactId = await prisma.$transaction(async (tx) => {
    const newContact = await tx.contact.create({
      data: { id: newId(), workspaceId: input.workspaceId, displayName: original.displayName, isVip: original.isVip },
    });

    await tx.contactIdentity.updateMany({
      where: { id: { in: identitiesToMove.map((i) => i.id) } },
      data: { contactId: newContact.id },
    });

    const movedProviderIds = [...new Set(identitiesToMove.map((i) => i.providerId))];
    const affectedConversations = await tx.conversation.findMany({
      where: { workspaceId: input.workspaceId, providerId: { in: movedProviderIds } },
      select: { id: true },
    });
    await tx.message.updateMany({
      where: { senderContactId: input.contactId, conversationId: { in: affectedConversations.map((c) => c.id) } },
      data: { senderContactId: newContact.id },
    });

    await tx.identitySplitLog.create({
      data: {
        id: newId(),
        workspaceId: input.workspaceId,
        originalContactId: input.contactId,
        resultingContactIds: [input.contactId, newContact.id],
        splitByUserId: input.splitByUserId,
        reason: input.reason ?? null,
      },
    });

    return newContact.id;
  });

  return { newContactId };
}
