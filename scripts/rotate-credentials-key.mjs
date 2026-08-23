import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getPrismaClient } from "@smc/database";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

/**
 * Re-encrypts secret_records from an old key version to the active one.
 * Mirrors apps/api/src/credentials-store/{service,config}.ts's key-ring
 * logic directly (scripts/ can't import apps/api's TS source - only
 * published workspace packages) - if that logic ever changes, this file
 * needs the same change.
 *
 * SECURITY: never logs a plaintext, a key, a ciphertext, an IV, or an auth
 * tag - only ref (UUID) and counts. Default mode is DRY RUN; pass --execute
 * to actually write. Not run automatically anywhere (no prestart hook,
 * no CI step) - a human runs this deliberately, following
 * docs/runbooks/credentials-key-rotation.md.
 *
 * Usage:
 *   node scripts/rotate-credentials-key.mjs                 # dry run
 *   node scripts/rotate-credentials-key.mjs --execute        # real rotation
 */

function loadKeyRing() {
  const ring = new Map();
  const v1 = process.env.CREDENTIALS_ENCRYPTION_KEY;
  const v2 = process.env.CREDENTIALS_ENCRYPTION_KEY_V2;
  if (v1) ring.set(1, parseKey("CREDENTIALS_ENCRYPTION_KEY", v1));
  if (v2) ring.set(2, parseKey("CREDENTIALS_ENCRYPTION_KEY_V2", v2));
  if (ring.size === 0) {
    throw new Error("No CREDENTIALS_ENCRYPTION_KEY(_V2) configured in this environment - refusing to run.");
  }
  return ring;
}

function parseKey(name, hex) {
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(`${name} must decode to 32 bytes (64 hex chars), got ${key.length}.`);
  }
  return key;
}

function activeVersion(ring) {
  const configured = process.env.CREDENTIALS_ENCRYPTION_ACTIVE_VERSION;
  if (configured) return Number(configured);
  return Math.max(...ring.keys());
}

function decrypt(key, record) {
  const decipher = createDecipheriv(ALGORITHM, key, record.iv);
  decipher.setAuthTag(record.authTag);
  return Buffer.concat([decipher.update(record.ciphertext), decipher.final()]);
}

function encrypt(key, plaintext) {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

async function main() {
  const execute = process.argv.includes("--execute");
  const prisma = getPrismaClient();
  const ring = loadKeyRing();
  const target = activeVersion(ring);
  if (!ring.has(target)) {
    throw new Error(`Active version ${target} has no configured key - check CREDENTIALS_ENCRYPTION_ACTIVE_VERSION.`);
  }

  const records = await prisma.secretRecord.findMany({ select: { id: true, keyVersion: true } });
  const byVersion = new Map();
  for (const r of records) byVersion.set(r.keyVersion, (byVersion.get(r.keyVersion) ?? 0) + 1);

  console.log(`Mode: ${execute ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Active/target key version: ${target}`);
  console.log(`Total secret_records: ${records.length}`);
  for (const [version, count] of [...byVersion.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  keyVersion=${version}: ${count} record(s)${version === target ? " (already current)" : ""}`);
  }

  const toRotate = records.filter((r) => r.keyVersion !== target);
  console.log(`Records needing rotation to version ${target}: ${toRotate.length}`);

  if (!execute) {
    console.log("Dry run complete - no changes made. Re-run with --execute to perform the rotation.");
    return;
  }

  let rotated = 0;
  let errors = 0;
  for (const { id } of toRotate) {
    try {
      const full = await prisma.secretRecord.findUnique({ where: { id } });
      if (!full) continue; // deleted concurrently - not an error
      const sourceKey = ring.get(full.keyVersion);
      if (!sourceKey) {
        console.error(`SKIP ${id}: no key configured for its keyVersion=${full.keyVersion}`);
        errors += 1;
        continue;
      }
      const plaintext = decrypt(sourceKey, full);
      const { ciphertext, iv, authTag } = encrypt(ring.get(target), plaintext);
      await prisma.secretRecord.update({
        where: { id },
        data: { ciphertext, iv, authTag, keyVersion: target },
      });
      rotated += 1;
    } catch (err) {
      console.error(`SKIP ${id}: rotation failed - ${err instanceof Error ? err.message : String(err)}`);
      errors += 1;
    }
  }

  console.log(`Rotated: ${rotated}, Skipped/errors: ${errors}`);
  if (errors > 0) {
    console.error(`Rotation completed with ${errors} error(s) - re-run to retry the remaining records.`);
    process.exitCode = 1;
  } else {
    console.log("Rotation completed successfully.");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
