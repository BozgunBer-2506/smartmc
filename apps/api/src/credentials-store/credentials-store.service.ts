import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { getPrismaClient, newId } from "@smc/database";
import { AuditLogService } from "../audit/audit-log.service";
import { credentialsStoreConfig } from "../config/credentials-store.config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

/**
 * Who's asking for a decrypted credential, and whether that retrieval is
 * worth an audit record. `audit: false` is reserved for high-frequency,
 * routine reconciliation polling (every 15 min per connected account) -
 * those already surface failures via `LinkedAccount.lastError`/`status`,
 * so a decrypt failure there isn't silently lost, it just doesn't also get
 * a separate audit_logs row for every successful poll. Every other
 * retrieval (an actual send, a disconnect flow, establishing a Gateway
 * connection) is real credential *use*, not routine checking, and is
 * audited regardless of frequency.
 */
export interface CredentialAccessContext {
  workspaceId: string;
  actorType: "user" | "system" | "rule";
  actorUserId?: string | null;
  audit: boolean;
}

/**
 * The interim connector-credential store (ADR-0016). SECURITY.md Section 5
 * specifies an external secrets manager (Vault/AWS Secrets Manager); this
 * implements the same `credentials_ref`-indirection contract that document
 * requires, backed by AES-256-GCM envelope encryption in Postgres instead -
 * disclosed as a pre-production posture in the ADR, not presented as the
 * final design. Every connector (Telegram today, others later) talks only
 * to this interface, never to `secret_records` directly - swapping the
 * backing implementation later touches this one file.
 *
 * Key rotation (credentials security hardening pass, docs/adr/0016...): each
 * row records the `keyVersion` it was encrypted under; `getSecret` looks up
 * the matching key rather than assuming there's only ever been one.
 */
@Injectable()
export class CredentialsStoreService {
  constructor(private readonly auditLog: AuditLogService) {}

  async putSecret(plaintext: string): Promise<{ ref: string }> {
    const prisma = getPrismaClient();
    const keyVersion = credentialsStoreConfig.activeVersion();
    const key = credentialsStoreConfig.encryptionKeyForVersion(keyVersion);
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const record = await prisma.secretRecord.create({
      data: { id: newId(), ciphertext, iv, authTag, keyVersion },
    });

    return { ref: record.id };
  }

  async getSecret(ref: string, context: CredentialAccessContext): Promise<string> {
    const prisma = getPrismaClient();
    const record = await prisma.secretRecord.findUnique({ where: { id: ref } });
    if (!record) {
      throw new Error(`No secret found for ref "${ref}" - it may have already been deleted.`);
    }

    // Phase 16.1 pre-work fix: SecretRecord carries no workspaceId of its
    // own (it's opaque ciphertext, referenced only via
    // LinkedAccount.credentialsRef) - every existing caller already
    // passes the workspaceId that owns the LinkedAccount it fetched `ref`
    // from, so this check is a no-op for every legitimate call today, and
    // closes the gap where a single future bug at any call site (passing
    // an unverified `ref`) would otherwise become a direct cross-tenant
    // bot-token read with no defense inside the store itself.
    await this.assertOwnedByWorkspace(ref, context.workspaceId);

    const key = credentialsStoreConfig.encryptionKeyForVersion(record.keyVersion);
    const decipher = createDecipheriv(ALGORITHM, key, record.iv);
    decipher.setAuthTag(record.authTag);
    const plaintext = Buffer.concat([decipher.update(record.ciphertext), decipher.final()]);

    if (context.audit) {
      // Fire-and-forget is deliberately not used here - a lost audit
      // record is worse than a slightly slower credential read, and every
      // caller already awaits this method.
      await this.auditLog.log({
        workspaceId: context.workspaceId,
        actorUserId: context.actorUserId ?? null,
        actorType: context.actorType,
        action: "credential.retrieved",
        resourceType: "secret_record",
        resourceId: ref,
      });
    }

    return plaintext.toString("utf8");
  }

  /**
   * Unconditional, irreversible deletion (SECURITY.md Section 5.2) -
   * `secret_records` is deliberately excluded from the soft-delete
   * extension (packages/database/src/soft-delete.ts), so this is a real
   * Postgres DELETE, not a `deletedAt` update. `workspaceId` is required
   * (Phase 16.1 pre-work fix) and checked the same way `getSecret` is -
   * every existing caller already has the owning LinkedAccount's
   * `workspaceId` in scope at the call site.
   */
  async deleteSecret(ref: string, workspaceId: string): Promise<void> {
    await this.assertOwnedByWorkspace(ref, workspaceId);
    const prisma = getPrismaClient();
    await prisma.secretRecord.delete({ where: { id: ref } }).catch(() => undefined);
  }

  /** Fail-closed: a `ref` with no matching LinkedAccount in this workspace is treated identically to "not found," never silently allowed through. */
  private async assertOwnedByWorkspace(ref: string, workspaceId: string): Promise<void> {
    const prisma = getPrismaClient();
    const owner = await prisma.linkedAccount.findFirst({ where: { credentialsRef: ref, workspaceId } });
    if (!owner) {
      throw new Error(`Secret "${ref}" is not owned by workspace "${workspaceId}".`);
    }
  }
}
