import { getPrismaClient, newId, type Contact } from "@smc/database";

export interface ResolveIdentityInput {
  workspaceId: string;
  providerId: string;
  externalId: string;
  handle?: string;
  displayName?: string;
}

/**
 * IdentityGraph's entry point (docs/ARCHITECTURE.md Section 13): resolves
 * a provider-native sender identity to a canonical Contact, creating one
 * if none exists.
 *
 * Phase 1 scope only implements exact-match resolution (docs/ROADMAP.md
 * Phase 3): a deterministic match on (providerId, externalId, workspaceId).
 * There is no fuzzy/cross-provider matching here - per docs/ARCHITECTURE.md
 * Section 13.6, that requires human confirmation via a persisted
 * identity_merge_suggestions review queue, which is Phase 9 scope, not
 * implemented yet. This function never merges anything - it only ever
 * recognizes an exact repeat of the same provider account, or creates a
 * brand-new Contact.
 */
export async function resolveIdentity(
  input: ResolveIdentityInput,
): Promise<Contact> {
  const prisma = getPrismaClient();

  const existingIdentity = await prisma.contactIdentity.findFirst({
    where: {
      workspaceId: input.workspaceId,
      providerId: input.providerId,
      externalId: input.externalId,
    },
    include: { contact: true },
  });

  if (existingIdentity) {
    return existingIdentity.contact;
  }

  const displayName =
    input.displayName ?? input.handle ?? `Unknown (${input.externalId})`;

  const contact = await prisma.$transaction(async (tx) => {
    const createdContact = await tx.contact.create({
      data: {
        id: newId(),
        workspaceId: input.workspaceId,
        displayName,
        isVip: false,
      },
    });

    await tx.contactIdentity.create({
      data: {
        id: newId(),
        contactId: createdContact.id,
        workspaceId: input.workspaceId,
        providerId: input.providerId,
        externalId: input.externalId,
        handle: input.handle ?? null,
        matchType: "exact",
      },
    });

    return createdContact;
  });

  return contact;
}
