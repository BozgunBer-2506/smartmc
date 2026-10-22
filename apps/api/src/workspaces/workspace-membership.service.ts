import { createHash, randomBytes } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, newId } from "@smc/database";
import { AuditLogService } from "../audit/audit-log.service";
import { normalizeEmail } from "../auth/auth.utils";
import { SessionService, type IssuedSession, type RequestContext } from "../auth/session.service";
import { httpError } from "../common/http-error";
import { RealtimeGateway } from "../realtime/realtime.gateway";

export type WorkspaceRole = "owner" | "admin" | "member";

const INVITE_TTL_DAYS = 7;

function generateInviteCode(): string {
  return randomBytes(24).toString("base64url");
}

/** Same reasoning as beta-invite.utils.ts's hashInviteCode: a high-entropy random value, not a password. */
function hashInviteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Phase 16.1 - the backend half of docs/architecture/personal-business-split.md
 * Section 4 ("Membership management (backend only)"). Owns every
 * membership-shape change beyond the one `register()` already makes
 * (one owner, one workspace): creating an additional workspace, inviting/
 * accepting/removing/leaving, and atomic ownership transfer.
 *
 * Role-authority invariants (personal-business-split.md Section 3,
 * decided there, enforced here - not reopened):
 * - Exactly one `owner` per workspace at all times.
 * - Only the current owner can transfer ownership; transfer + the old
 *   owner's demotion happen in one transaction, never a window with 0 or
 *   2 owners.
 * - An admin may invite/remove/change the role of `member`s only - never
 *   another admin, never the owner.
 * - The sole owner of a workspace with other members cannot leave without
 *   transferring ownership first - the same rule
 *   account-deletion.service.ts already enforces for account deletion,
 *   extended here to a plain "leave" action.
 *
 * `@Roles("owner"|"admin")` + `RolesGuard` (wired for the first time by
 * this phase) cover the coarse "does this role even reach this
 * endpoint" gate at the controller; this service covers the finer,
 * target-dependent invariants a role allow-list alone can't express
 * (e.g. "admin, but not against another admin or the owner").
 */
@Injectable()
export class WorkspaceMembershipService {
  constructor(
    private readonly sessionService: SessionService,
    private readonly auditLog: AuditLogService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * The only path to a second workspace (personal-business-split.md
   * Section 3's "Personal -> Business transition" decision): a new
   * sibling Workspace under the caller's own Organization - never an
   * in-place conversion of an existing one. Returns a fresh token pair
   * scoped to the new workspace, the same way register()/login() do,
   * since the caller needs a usable token for a workspace their current
   * one doesn't claim.
   */
  async createWorkspace(
    actorUserId: string,
    organizationId: string,
    name: string | undefined,
    ctx: RequestContext,
  ): Promise<IssuedSession & { workspaceId: string }> {
    const prisma = getPrismaClient();

    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: { id: newId(), organizationId, name: name?.trim() || "New Workspace" },
      });
      await tx.workspaceMember.create({
        data: { id: newId(), workspaceId: ws.id, userId: actorUserId, role: "owner" },
      });
      return ws;
    });

    const issued = await this.sessionService.issue(
      { userId: actorUserId, workspaceId: workspace.id, orgId: organizationId, role: "owner" },
      ctx,
    );

    await this.auditLog.log({
      workspaceId: workspace.id,
      organizationId,
      actorUserId,
      actorType: "user",
      action: "workspace.created",
      resourceType: "workspace",
      resourceId: workspace.id,
    });

    return { ...issued, workspaceId: workspace.id };
  }

  async listMembers(workspaceId: string) {
    const prisma = getPrismaClient();
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { email: true, displayName: true } } },
      orderBy: { joinedAt: "asc" },
    });
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      displayName: m.user.displayName,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  async invite(
    workspaceId: string,
    actorUserId: string,
    args: { email?: string; role: "admin" | "member" },
  ): Promise<{ code: string; expiresAt: Date }> {
    const prisma = getPrismaClient();
    const code = generateInviteCode();
    const invite = await prisma.workspaceInvite.create({
      data: {
        id: newId(),
        workspaceId,
        email: args.email ? normalizeEmail(args.email) : null,
        role: args.role,
        codeHash: hashInviteCode(code),
        invitedByUserId: actorUserId,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await this.auditLog.log({
      workspaceId,
      actorUserId,
      actorType: "user",
      action: "workspace.invite_created",
      resourceType: "workspace_invite",
      resourceId: invite.id,
      metadata: { role: args.role },
    });

    // The plaintext code is returned here, exactly once - shown to the
    // inviter the same way scripts/create-beta-invite.ts's own one-time
    // display works - and never stored; the DB row only ever has the hash.
    return { code, expiresAt: invite.expiresAt };
  }

  async acceptInvite(code: string, acceptingUserId: string, ctx: RequestContext) {
    const prisma = getPrismaClient();
    const invalid = () =>
      httpError(HttpStatus.BAD_REQUEST, "INVITE_INVALID", "This invite code is invalid, expired, or has already been used.");

    if (!code || !code.trim()) throw invalid();
    const codeHash = hashInviteCode(code);
    const invite = await prisma.workspaceInvite.findUnique({ where: { codeHash } });
    if (!invite) throw invalid();
    if (invite.revokedAt) throw invalid();
    if (invite.usedAt) throw invalid();
    if (invite.expiresAt.getTime() < Date.now()) throw invalid();

    const user = await prisma.user.findFirst({ where: { id: acceptingUserId } });
    if (!user) throw httpError(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "User not found.");
    if (invite.email && invite.email !== normalizeEmail(user.email)) throw invalid();

    const workspace = await prisma.workspace.findFirst({ where: { id: invite.workspaceId } });
    if (!workspace) throw invalid(); // workspace deleted since the invite was sent

    const existingMembership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: invite.workspaceId, userId: acceptingUserId },
    });
    if (existingMembership) {
      throw httpError(HttpStatus.CONFLICT, "ALREADY_MEMBER", "You are already a member of this workspace.");
    }

    await prisma.$transaction(async (tx) => {
      // Single-use guard via `usedAt`, not existence - same reasoning
      // beta-invite.utils.ts documents: the real mutual-exclusion
      // guarantee is Postgres's row lock during this UPDATE, not a
      // caller-side read-then-write.
      const claimed = await tx.workspaceInvite.updateMany({
        where: { id: invite.id, usedAt: null, revokedAt: null },
        data: { usedByUserId: acceptingUserId, usedAt: new Date() },
      });
      if (claimed.count === 0) throw invalid();

      await tx.workspaceMember.create({
        data: {
          id: newId(),
          workspaceId: invite.workspaceId,
          userId: acceptingUserId,
          role: invite.role,
          invitedByUserId: invite.invitedByUserId,
        },
      });
    });

    const issued = await this.sessionService.issue(
      { userId: acceptingUserId, workspaceId: invite.workspaceId, orgId: workspace.organizationId, role: invite.role },
      ctx,
    );

    await this.auditLog.log({
      workspaceId: invite.workspaceId,
      actorUserId: acceptingUserId,
      actorType: "user",
      action: "workspace.invite_accepted",
      resourceType: "workspace_invite",
      resourceId: invite.id,
    });

    return { ...issued, workspaceId: invite.workspaceId, role: invite.role };
  }

  async changeMemberRole(
    workspaceId: string,
    actorUserId: string,
    actorRole: WorkspaceRole,
    targetMemberId: string,
    newRole: "admin" | "member",
  ) {
    const prisma = getPrismaClient();
    const target = await prisma.workspaceMember.findFirst({ where: { id: targetMemberId, workspaceId } });
    if (!target) throw httpError(HttpStatus.NOT_FOUND, "MEMBER_NOT_FOUND", "Member not found.");

    if (target.userId === actorUserId) {
      throw httpError(
        HttpStatus.BAD_REQUEST,
        "CANNOT_CHANGE_OWN_ROLE",
        "You cannot change your own role - use transfer-ownership or leave instead.",
      );
    }
    if (target.role === "owner") {
      throw httpError(
        HttpStatus.FORBIDDEN,
        "OWNER_ROLE_IMMUTABLE_HERE",
        "The owner's role can only change via POST /v1/workspace/transfer-ownership.",
      );
    }
    // An admin may only act on plain members - never another admin. The
    // owner (checked above) and "any role at all" (RolesGuard's @Roles
    // gate at the controller) are already excluded by this point.
    if (actorRole === "admin" && target.role !== "member") {
      throw httpError(HttpStatus.FORBIDDEN, "INSUFFICIENT_ROLE", "An admin can only change the role of a plain member.");
    }

    const updated = await prisma.workspaceMember.update({ where: { id: target.id }, data: { role: newRole } });

    await this.auditLog.log({
      workspaceId,
      actorUserId,
      actorType: "user",
      action: "workspace.member_role_changed",
      resourceType: "workspace_member",
      resourceId: target.id,
      metadata: { from: target.role, to: newRole },
    });

    return { id: updated.id, role: updated.role };
  }

  async removeMember(workspaceId: string, actorUserId: string, actorRole: WorkspaceRole, targetMemberId: string) {
    const prisma = getPrismaClient();
    const target = await prisma.workspaceMember.findFirst({ where: { id: targetMemberId, workspaceId } });
    if (!target) throw httpError(HttpStatus.NOT_FOUND, "MEMBER_NOT_FOUND", "Member not found.");

    if (target.userId === actorUserId) {
      throw httpError(HttpStatus.BAD_REQUEST, "USE_LEAVE_ENDPOINT", "Use POST /v1/workspace/leave to remove your own membership.");
    }
    if (target.role === "owner") {
      throw httpError(HttpStatus.FORBIDDEN, "OWNER_CANNOT_BE_REMOVED", "The workspace owner cannot be removed - transfer ownership first.");
    }
    if (actorRole === "admin" && target.role !== "member") {
      throw httpError(HttpStatus.FORBIDDEN, "INSUFFICIENT_ROLE", "An admin can only remove a plain member.");
    }

    // WorkspaceMember is soft-delete-intercepted - raw DELETE for real
    // removal, same bypass account-deletion.service.ts/
    // workspace-deletion.service.ts already use for this exact table (a
    // soft-deleted row would still occupy the (workspace_id, user_id)
    // unique constraint, blocking a future re-invite of the same person).
    await prisma.$executeRaw`DELETE FROM workspace_members WHERE id = ${target.id}::uuid`;
    this.realtimeGateway.disconnectMember(workspaceId, target.userId);

    await this.auditLog.log({
      workspaceId,
      actorUserId,
      actorType: "user",
      action: "workspace.member_removed",
      resourceType: "workspace_member",
      resourceId: target.id,
      metadata: { removedUserId: target.userId, removedRole: target.role },
    });
  }

  /**
   * A sole owner with other members is rejected, never silently taking
   * their access with them - the exact same product rule
   * account-deletion.service.ts already enforces for account deletion,
   * applied here to a plain "leave" action. A sole owner with no other
   * members has nothing to leave to - directed at workspace deletion
   * instead, not a silent no-op or an orphaned-workspace state.
   */
  async leave(workspaceId: string, userId: string) {
    const prisma = getPrismaClient();
    const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
    if (!member) throw httpError(HttpStatus.NOT_FOUND, "WORKSPACE_NOT_FOUND", "Workspace not found.");

    if (member.role === "owner") {
      const otherMember = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: { not: userId } } });
      if (otherMember) {
        throw httpError(
          HttpStatus.CONFLICT,
          "WORKSPACE_HAS_OTHER_MEMBERS",
          "You are the sole owner of a workspace that has other members. Transfer ownership before leaving.",
        );
      }
      throw httpError(
        HttpStatus.BAD_REQUEST,
        "SOLE_OWNER_CANNOT_LEAVE",
        "You are the only member of this workspace. Delete the workspace (DELETE /v1/workspace) instead of leaving it.",
      );
    }

    await prisma.$executeRaw`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${userId}::uuid`;
    this.realtimeGateway.disconnectMember(workspaceId, userId);

    await this.auditLog.log({
      workspaceId,
      actorUserId: userId,
      actorType: "user",
      action: "workspace.member_left",
      resourceType: "workspace_member",
      resourceId: member.id,
    });
  }

  /**
   * Atomic ownership transfer (personal-business-split.md Section 3) -
   * the old owner's demotion and the new owner's promotion happen inside
   * one `FOR UPDATE`-locked transaction, same pattern
   * workspace-deletion.service.ts already uses and already documents in
   * detail: a concurrent second transfer attempt blocks on the row lock
   * until the first commits, then re-reads and correctly finds the
   * caller is no longer `owner` (`OWNER_ROLE_REQUIRED`) - never two
   * transfers both succeeding, never a window with zero or two owners.
   */
  async transferOwnership(workspaceId: string, actorUserId: string, newOwnerUserId: string) {
    if (actorUserId === newOwnerUserId) {
      throw httpError(HttpStatus.BAD_REQUEST, "ALREADY_OWNER", "You are already the owner.");
    }
    const prisma = getPrismaClient();

    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`;
      if (locked.length === 0) {
        throw httpError(HttpStatus.NOT_FOUND, "WORKSPACE_NOT_FOUND", "Workspace not found.");
      }

      const actorMember = await tx.workspaceMember.findFirst({ where: { workspaceId, userId: actorUserId, role: "owner" } });
      if (!actorMember) {
        throw httpError(HttpStatus.FORBIDDEN, "OWNER_ROLE_REQUIRED", "Only the current owner can transfer ownership.");
      }

      const targetMember = await tx.workspaceMember.findFirst({ where: { workspaceId, userId: newOwnerUserId } });
      if (!targetMember) {
        throw httpError(HttpStatus.NOT_FOUND, "MEMBER_NOT_FOUND", "The new owner must already be a member of this workspace.");
      }

      await tx.workspaceMember.update({ where: { id: actorMember.id }, data: { role: "admin" } });
      await tx.workspaceMember.update({ where: { id: targetMember.id }, data: { role: "owner" } });
    });

    await this.auditLog.log({
      workspaceId,
      actorUserId,
      actorType: "user",
      action: "workspace.ownership_transferred",
      resourceType: "workspace",
      resourceId: workspaceId,
      metadata: { newOwnerUserId },
    });
  }
}
