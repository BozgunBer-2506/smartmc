import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { getPrismaClient, newId } from "@smc/database";
import { credentialsStoreConfig } from "../config/credentials-store.config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

/**
 * The interim connector-credential store (ADR-0016). SECURITY.md Section 5
 * specifies an external secrets manager (Vault/AWS Secrets Manager); this
 * implements the same `credentials_ref`-indirection contract that document
 * requires, backed by AES-256-GCM envelope encryption in Postgres instead -
 * disclosed as a pre-production posture in the ADR, not presented as the
 * final design. Every connector (Telegram today, others later) talks only
 * to this interface, never to `secret_records` directly - swapping the
 * backing implementation later touches this one file.
 */
@Injectable()
export class CredentialsStoreService {
  async putSecret(plaintext: string): Promise<{ ref: string }> {
    const prisma = getPrismaClient();
    const key = credentialsStoreConfig.encryptionKey();
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const record = await prisma.secretRecord.create({
      data: { id: newId(), ciphertext, iv, authTag },
    });

    return { ref: record.id };
  }

  async getSecret(ref: string): Promise<string> {
    const prisma = getPrismaClient();
    const record = await prisma.secretRecord.findUnique({ where: { id: ref } });
    if (!record) {
      throw new Error(`No secret found for ref "${ref}" - it may have already been deleted.`);
    }

    const key = credentialsStoreConfig.encryptionKey();
    const decipher = createDecipheriv(ALGORITHM, key, record.iv);
    decipher.setAuthTag(record.authTag);
    const plaintext = Buffer.concat([decipher.update(record.ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  }

  /**
   * Unconditional, irreversible deletion (SECURITY.md Section 5.2) -
   * `secret_records` is deliberately excluded from the soft-delete
   * extension (packages/database/src/soft-delete.ts), so this is a real
   * Postgres DELETE, not a `deletedAt` update.
   */
  async deleteSecret(ref: string): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.secretRecord.delete({ where: { id: ref } }).catch(() => undefined);
  }
}
