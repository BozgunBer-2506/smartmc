import { Injectable } from "@nestjs/common";
import { getPrismaClient, newId, type Prisma } from "@smc/database";

export interface AuditLogEntry {
  workspaceId?: string | null;
  organizationId?: string | null;
  actorUserId?: string | null;
  actorType: "user" | "system" | "rule" | "api_key";
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * The only write path to `audit_logs` (docs/DATABASE.md Section 6.21) -
 * deliberately exposes only `log()`, never update/delete, so application
 * code cannot tamper with its own audit trail. Postgres-role-level
 * enforcement (REVOKE UPDATE, DELETE on the app's DB role) is deferred,
 * per docs/DATABASE.md Section 21 - already a tracked gap since the
 * Phase 1 review, not a new one.
 */
@Injectable()
export class AuditLogService {
  async log(entry: AuditLogEntry): Promise<void> {
    const prisma = getPrismaClient();
    await prisma.auditLog.create({
      data: {
        id: newId(),
        workspaceId: entry.workspaceId ?? null,
        organizationId: entry.organizationId ?? null,
        actorUserId: entry.actorUserId ?? null,
        actorType: entry.actorType,
        action: entry.action,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }
}
