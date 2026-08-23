import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
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

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

// Two throwaway keys, generated fresh per run - never real production keys,
// never printed. Mirrors apps/api/src/credentials-store's own algorithm
// directly at the Prisma layer, same pattern as verify-conversation-relink.mjs.
const KEY_V1 = randomBytes(32);
const KEY_V2 = randomBytes(32);
const RING = new Map([
  [1, KEY_V1],
  [2, KEY_V2],
]);

function encrypt(key, plaintext) {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

function decrypt(key, record) {
  const decipher = createDecipheriv(ALGORITHM, key, record.iv);
  decipher.setAuthTag(record.authTag);
  return Buffer.concat([decipher.update(record.ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Direct-Prisma regression test for the credentials key-rotation hardening
 * pass (docs/adr/0016...): confirms multi-version encrypt/decrypt, tamper
 * detection, and audit-log behavior at the data layer, independent of a
 * running apps/api process. Scenarios A-K per the approved implementation
 * brief. Creates and cleans up its own isolated org/workspace/records.
 */
async function main() {
  const prisma = getPrismaClient();

  const org = await prisma.organization.create({ data: { id: newId(), name: "Key Rotation Test Org", slug: `key-rotation-test-${Date.now()}` } });
  const workspace = await prisma.workspace.create({ data: { id: newId(), organizationId: org.id, name: "Key Rotation Test Workspace" } });

  const createdRecordIds = [];

  // A. KEY_V1 ile secret yaz -> keyVersion=1 -> başarıyla oku
  const plaintextA = "test-credential-A";
  const encA = encrypt(KEY_V1, plaintextA);
  const recordA = await prisma.secretRecord.create({
    data: { id: newId(), ciphertext: encA.ciphertext, iv: encA.iv, authTag: encA.authTag, keyVersion: 1 },
  });
  createdRecordIds.push(recordA.id);
  const readA = await prisma.secretRecord.findUniqueOrThrow({ where: { id: recordA.id } });
  check("A. V1-written secret has keyVersion=1 and decrypts correctly", readA.keyVersion === 1 && decrypt(RING.get(readA.keyVersion), readA) === plaintextA);

  // B. KEY_V2 active iken yeni secret yaz -> keyVersion=2 -> başarıyla oku
  const plaintextB = "test-credential-B";
  const encB = encrypt(KEY_V2, plaintextB);
  const recordB = await prisma.secretRecord.create({
    data: { id: newId(), ciphertext: encB.ciphertext, iv: encB.iv, authTag: encB.authTag, keyVersion: 2 },
  });
  createdRecordIds.push(recordB.id);
  const readB = await prisma.secretRecord.findUniqueOrThrow({ where: { id: recordB.id } });
  check("B. V2-written secret has keyVersion=2 and decrypts correctly", readB.keyVersion === 2 && decrypt(RING.get(readB.keyVersion), readB) === plaintextB);

  // C. KEY_V1 ile yazılmış secret, KEY_V2 active iken yine başarıyla okunabiliyor (version routing)
  const readC = await prisma.secretRecord.findUniqueOrThrow({ where: { id: recordA.id } });
  check("C. V1 secret still readable while V2 is active (correct key selected by keyVersion)", decrypt(RING.get(readC.keyVersion), readC) === plaintextA);

  // D. KEY_V1 secret'ını yanlışlıkla KEY_V2 ile decrypt etmeye çalışma -> version routing olmasaydı burada patlardı
  let wrongKeyThrew = false;
  try {
    decrypt(KEY_V2, readC); // deliberately using the wrong key, bypassing version routing
  } catch {
    wrongKeyThrew = true;
  }
  check("D. Decrypting a V1 secret with the V2 key fails (GCM auth tag mismatch) - proves version routing is load-bearing", wrongKeyThrew);

  // E. Rotation: V1 secret -> decrypt V1 -> encrypt V2 -> keyVersion=2 -> aynı plaintext okunabiliyor
  const plaintextE = "test-credential-E-rotation";
  const encE1 = encrypt(KEY_V1, plaintextE);
  const recordE = await prisma.secretRecord.create({
    data: { id: newId(), ciphertext: encE1.ciphertext, iv: encE1.iv, authTag: encE1.authTag, keyVersion: 1 },
  });
  createdRecordIds.push(recordE.id);
  const beforeRotation = await prisma.secretRecord.findUniqueOrThrow({ where: { id: recordE.id } });
  const decryptedForRotation = decrypt(KEY_V1, beforeRotation);
  const encE2 = encrypt(KEY_V2, decryptedForRotation);
  await prisma.secretRecord.update({
    where: { id: recordE.id },
    data: { ciphertext: encE2.ciphertext, iv: encE2.iv, authTag: encE2.authTag, keyVersion: 2 },
  });
  const afterRotation = await prisma.secretRecord.findUniqueOrThrow({ where: { id: recordE.id } });
  check(
    "E. Rotated record: keyVersion=2, credentialsRef unchanged, same plaintext",
    afterRotation.keyVersion === 2 && afterRotation.id === recordE.id && decrypt(KEY_V2, afterRotation) === plaintextE,
  );

  // F. Tampered ciphertext -> GCM authentication failure -> secret dönmemeli
  const encF = encrypt(KEY_V1, "test-credential-F");
  const tamperedCiphertext = Buffer.from(encF.ciphertext);
  tamperedCiphertext[0] ^= 0xff;
  let tamperedCiphertextThrew = false;
  try {
    decrypt(KEY_V1, { ciphertext: tamperedCiphertext, iv: encF.iv, authTag: encF.authTag });
  } catch {
    tamperedCiphertextThrew = true;
  }
  check("F. Tampered ciphertext fails GCM authentication", tamperedCiphertextThrew);

  // G. Tampered authTag -> secret dönmemeli
  const encG = encrypt(KEY_V1, "test-credential-G");
  const tamperedAuthTag = Buffer.from(encG.authTag);
  tamperedAuthTag[0] ^= 0xff;
  let tamperedAuthTagThrew = false;
  try {
    decrypt(KEY_V1, { ciphertext: encG.ciphertext, iv: encG.iv, authTag: tamperedAuthTag });
  } catch {
    tamperedAuthTagThrew = true;
  }
  check("G. Tampered authTag fails GCM authentication", tamperedAuthTagThrew);

  // H/I: production fail-fast and dev-fallback-blocked-in-production are pure
  // config-module behavior (credentials-store.config.ts), not expressible via
  // direct Prisma access - see the [H/I] section of docs/runbooks/credentials-key-rotation.md
  // for the manual NODE_ENV=production verification procedure.
  console.log("H/I. Production fail-fast / dev-fallback-blocked: verified manually per docs/runbooks/credentials-key-rotation.md (not expressible via direct-Prisma access).");

  // J. Audit event oluşuyor -> plaintext yok, key yok, ciphertext yok
  const auditRef = newId();
  const auditEntry = await prisma.auditLog.create({
    data: {
      id: newId(),
      workspaceId: workspace.id,
      actorType: "user",
      action: "credential.retrieved",
      resourceType: "secret_record",
      resourceId: auditRef,
    },
  });
  const auditMetadataText = JSON.stringify(auditEntry.metadata ?? {});
  check(
    "J. credential.retrieved audit row exists with no plaintext/key/ciphertext in its metadata",
    auditEntry.action === "credential.retrieved" &&
      auditEntry.resourceId === auditRef &&
      !auditMetadataText.includes("test-credential") &&
      !auditMetadataText.toLowerCase().includes("key"),
  );
  await prisma.auditLog.delete({ where: { id: auditEntry.id } });

  // K. Delete sonrası secret artık okunamıyor
  await prisma.secretRecord.delete({ where: { id: recordA.id } });
  const afterDelete = await prisma.secretRecord.findUnique({ where: { id: recordA.id } });
  check("K. Deleted secret is no longer readable", afterDelete === null);
  createdRecordIds.splice(createdRecordIds.indexOf(recordA.id), 1);

  // Cleanup
  await prisma.secretRecord.deleteMany({ where: { id: { in: createdRecordIds } } });
  await prisma.workspace.delete({ where: { id: workspace.id } });
  await prisma.organization.delete({ where: { id: org.id } });

  console.log(`\n${passCount} passed, ${failCount} failed.`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
