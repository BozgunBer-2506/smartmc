import { getPrismaClient, newId } from "@smc/database";

let passCount = 0;
let failCount = 0;

function check(label, condition) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passCount += 1;
  } else {
    console.error(`FAIL: ${label}`);
    failCount += 1;
  }
}

/**
 * Direct-Prisma regression test for the conversation-relink fix
 * (`apps/api/src/events/events.processor.ts`'s conversation `upsert`),
 * found via a real production scheduled-send failure (Phase 21.6): a
 * conversation's `linkedAccountId` was previously only ever set at
 * `create` time, so any conversation surviving a disconnect/reconnect
 * cycle stayed pointed at the old, soft-deleted LinkedAccount forever -
 * outbound send then permanently 422s with LINKED_ACCOUNT_REAUTH_REQUIRED
 * even after a successful reconnect. Mirrors the exact upsert shape
 * `EventsProcessor.handleMessageReceived` uses, at the Prisma layer
 * directly - same pattern as `scripts/verify-phase21.1-reconnect.mjs`.
 */
async function main() {
  const prisma = getPrismaClient();

  const org = await prisma.organization.create({ data: { id: newId(), name: "Relink Test Org", slug: `relink-test-${Date.now()}` } });
  const workspace = await prisma.workspace.create({ data: { id: newId(), organizationId: org.id, name: "Relink Test Workspace" } });
  const provider = await prisma.provider.upsert({
    where: { key: "relink-test-provider" },
    update: {},
    create: { id: newId(), key: "relink-test-provider", displayName: "Relink Test Provider" },
  });
  const secret = await prisma.secretRecord.create({
    data: { id: newId(), ciphertext: Buffer.from("unused"), iv: Buffer.from("unused-iv"), authTag: Buffer.from("unused-tag") },
  });

  const linkedAccountA = await prisma.linkedAccount.create({
    data: {
      id: newId(),
      workspaceId: workspace.id,
      providerId: provider.id,
      externalAccountId: "relink-bot",
      status: "active",
      credentialsRef: secret.id,
    },
  });

  const conversationKey = {
    providerId: provider.id,
    externalId: "relink-test-conversation",
    workspaceId: workspace.id,
  };

  // Message 1: conversation created, linked to account A - exactly how a first inbound message behaves today.
  const conv1 = await prisma.conversation.upsert({
    where: { uq_conversations_provider_external: conversationKey },
    update: { lastMessageAt: new Date(), linkedAccountId: linkedAccountA.id },
    create: {
      id: newId(),
      workspaceId: workspace.id,
      providerId: provider.id,
      linkedAccountId: linkedAccountA.id,
      externalId: conversationKey.externalId,
      lastMessageAt: new Date(),
    },
  });
  check("conversation created, linked to account A", conv1.linkedAccountId === linkedAccountA.id);

  // Simulate a disconnect (soft delete) + reconnect (a NEW LinkedAccount row - Phase 21.1's own design).
  await prisma.linkedAccount.delete({ where: { id: linkedAccountA.id } }); // withSoftDeletes intercepts this as an update setting deletedAt
  const deletedA = await prisma.linkedAccount.findUnique({ where: { id: linkedAccountA.id } });
  check("account A is soft-deleted (deletedAt set), not hard-deleted", Boolean(deletedA?.deletedAt));

  const linkedAccountB = await prisma.linkedAccount.create({
    data: {
      id: newId(),
      workspaceId: workspace.id,
      providerId: provider.id,
      externalAccountId: "relink-bot",
      status: "active",
      credentialsRef: secret.id,
    },
  });
  check("reconnect creates a NEW LinkedAccount row (account B), not a revived account A", linkedAccountB.id !== linkedAccountA.id);

  // Message 2, same conversation (same provider+externalId+workspace key), now arriving via account B - the exact upsert shape the fix touches.
  const conv2 = await prisma.conversation.upsert({
    where: { uq_conversations_provider_external: conversationKey },
    update: { lastMessageAt: new Date(), linkedAccountId: linkedAccountB.id },
    create: {
      id: newId(),
      workspaceId: workspace.id,
      providerId: provider.id,
      linkedAccountId: linkedAccountB.id,
      externalId: conversationKey.externalId,
      lastMessageAt: new Date(),
    },
  });
  check("the SAME conversation row was reused, not a duplicate created", conv2.id === conv1.id);
  check(
    "the conversation's linkedAccountId was re-pointed to account B after the second message (THE FIX)",
    conv2.linkedAccountId === linkedAccountB.id,
  );

  // Cleanup - this is throwaway synthetic data, not real product data.
  await prisma.message.deleteMany({ where: { conversationId: conv1.id } });
  await prisma.conversation.delete({ where: { id: conv1.id } });
  await prisma.linkedAccount.delete({ where: { id: linkedAccountB.id } }); // soft-delete via withSoftDeletes, fine for a throwaway row
  await prisma.secretRecord.delete({ where: { id: secret.id } });
  await prisma.workspace.delete({ where: { id: workspace.id } }); // soft-delete via withSoftDeletes
  await prisma.organization.delete({ where: { id: org.id } });

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
