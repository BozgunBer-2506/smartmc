const { getPrismaClient, newId } = require("@smc/database");

const WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  const prisma = getPrismaClient();

  const contact = await prisma.contact.create({
    data: {
      id: newId(),
      workspaceId: WORKSPACE_ID,
      displayName: "Soft Delete Test Subject",
      isVip: false,
    },
  });
  console.log("created:", contact.id);

  const foundBefore = await prisma.contact.findFirst({ where: { id: contact.id } });
  console.log("findFirst before delete finds it:", foundBefore !== null);

  await prisma.contact.delete({ where: { id: contact.id } });
  console.log("called prisma.contact.delete()");

  const foundAfter = await prisma.contact.findFirst({ where: { id: contact.id } });
  console.log("findFirst after delete finds it (should be false):", foundAfter !== null);

  const rawRow = await prisma.$queryRaw`SELECT id, deleted_at FROM contacts WHERE id = ${contact.id}::uuid`;
  console.log("raw row still exists in Postgres (proves it was NOT hard-deleted):", rawRow);

  const pass = foundBefore !== null && foundAfter === null && Array.isArray(rawRow) && rawRow.length === 1 && rawRow[0].deleted_at !== null;
  console.log(pass ? "PASS: soft delete extension works as designed" : "FAIL");
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
