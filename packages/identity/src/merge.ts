import { getPrismaClient, newId } from "@smc/database";

export class MergeSuggestionNotFoundError extends Error {}
export class MergeSuggestionNotPendingError extends Error {}

/**
 * Approving a suggestion (docs/DATABASE.md Section 6.6) - "candidate_contact_id_a"
 * is deterministically chosen as the surviving contact, "b" as the absorbed
 * one; both the suggestion's status and a permanent `IdentityMergeLog` row
 * are written in the same transaction, per the spec's "the suggestion
 * record and the completed-merge audit record are deliberately two
 * different tables serving two different questions." Every candidate match
 * this reaches has already passed through a human decision - this function
 * is never called automatically (ARCHITECTURE.md Section 13.6).
 */
export async function approveMergeSuggestion(suggestionId: string, reviewedByUserId: string): Promise<{ primaryContactId: string; mergedContactId: string }> {
  const prisma = getPrismaClient();

  const suggestion = await prisma.identityMergeSuggestion.findUnique({ where: { id: suggestionId } });
  if (!suggestion) throw new MergeSuggestionNotFoundError(`No IdentityMergeSuggestion with id ${suggestionId}`);
  if (suggestion.status !== "pending") throw new MergeSuggestionNotPendingError(`Suggestion ${suggestionId} is not pending (status: ${suggestion.status})`);

  const primaryContactId = suggestion.candidateContactIdA;
  const mergedContactId = suggestion.candidateContactIdB;

  await prisma.$transaction(async (tx) => {
    const mergedContact = await tx.contact.findUniqueOrThrow({ where: { id: mergedContactId } });

    await tx.contactIdentity.updateMany({ where: { contactId: mergedContactId }, data: { contactId: primaryContactId } });
    await tx.message.updateMany({ where: { senderContactId: mergedContactId }, data: { senderContactId: primaryContactId } });

    // VIP status survives a merge (docs/DATABASE.md Section 6.6's note that
    // "VIP status set before the split" is an implementation-level concern -
    // the symmetric rule for merges is applied here: never silently lose it.
    if (mergedContact.isVip) {
      await tx.contact.update({ where: { id: primaryContactId }, data: { isVip: true } });
    }

    await tx.contact.delete({ where: { id: mergedContactId } }); // soft delete, per the extension

    await tx.identityMergeSuggestion.update({
      where: { id: suggestionId },
      data: { status: "approved", reviewedByUserId, reviewedAt: new Date() },
    });

    await tx.identityMergeLog.create({
      data: {
        id: newId(),
        workspaceId: suggestion.workspaceId,
        primaryContactId,
        mergedContactId,
        mergedByUserId: reviewedByUserId,
        confidenceScoreAtMerge: suggestion.confidenceScore,
        matchingSignals: suggestion.matchingSignals ?? {},
      },
    });
  });

  return { primaryContactId, mergedContactId };
}

/** Rejecting a suggestion (docs/DATABASE.md Section 6.6) - the pair is not re-suggested by the routine matching process afterward (docs/reviews/phase-9-review.md discloses the exact mechanism used to enforce that). */
export async function rejectMergeSuggestion(suggestionId: string, reviewedByUserId: string): Promise<void> {
  const prisma = getPrismaClient();
  const suggestion = await prisma.identityMergeSuggestion.findUnique({ where: { id: suggestionId } });
  if (!suggestion) throw new MergeSuggestionNotFoundError(`No IdentityMergeSuggestion with id ${suggestionId}`);
  if (suggestion.status !== "pending") throw new MergeSuggestionNotPendingError(`Suggestion ${suggestionId} is not pending (status: ${suggestion.status})`);

  await prisma.identityMergeSuggestion.update({
    where: { id: suggestionId },
    data: { status: "rejected", reviewedByUserId, reviewedAt: new Date() },
  });
}
