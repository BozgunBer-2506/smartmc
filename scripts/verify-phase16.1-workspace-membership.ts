/**
 * Regression checks for Phase 16.1 (docs/architecture/personal-business-split.md
 * Section 4): business workspace creation, invites, accept/leave/remove,
 * owner/admin role authority (through the real JwtAuthGuard -> RolesGuard
 * -> controller chain, not just the service), last-owner protection, and
 * concurrent ownership transfer.
 *
 * Runs directly against the local dev Postgres - no live API server
 * needed. Every row created is deleted at the end, FK-safe order,
 * regardless of pass/fail.
 */
import "reflect-metadata";
import { randomBytes } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { getPrismaClient, newId } from "@smc/database";
import { authConfig } from "../apps/api/src/config/auth.config";
import { JwtAuthGuard } from "../apps/api/src/auth/jwt-auth.guard";
import { RolesGuard } from "../apps/api/src/auth/roles.guard";
import { TokenService } from "../apps/api/src/auth/token.service";
import { SessionService } from "../apps/api/src/auth/session.service";
import type { JwtPayload } from "../apps/api/src/auth/jwt-payload";
import { AuditLogService } from "../apps/api/src/audit/audit-log.service";
import { RealtimeGateway } from "../apps/api/src/realtime/realtime.gateway";
import { WorkspaceMembershipService } from "../apps/api/src/workspaces/workspace-membership.service";
import { WorkspaceMembershipController } from "../apps/api/src/workspaces/workspace-membership.controller";

let passCount = 0;
let failCount = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passCount += 1;
  } else {
    console.error(`FAIL: ${label}`);
    failCount += 1;
  }
}

async function throwsWithCode(fn: () => Promise<unknown>, expectedCode: string): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (err) {
    const code = (err as { response?: { code?: string } }).response?.code;
    if (code !== expectedCode) console.error(`  (expected code ${expectedCode}, got ${code}: ${(err as Error).message})`);
    return code === expectedCode;
  }
}

async function main() {
  const prisma = getPrismaClient();
  const jwtService = new JwtService();
  const tokenService = new TokenService(jwtService);
  const jwtAuthGuard = new JwtAuthGuard(tokenService);
  const rolesGuard = new RolesGuard(new Reflector());
  const auditLog = new AuditLogService();
  const sessionService = new SessionService(jwtService, auditLog);
  const realtimeGateway = new RealtimeGateway(tokenService);
  const membershipService = new WorkspaceMembershipService(sessionService, auditLog, realtimeGateway);
  const controller = new WorkspaceMembershipController(membershipService);

  function signToken(claims: Omit<JwtPayload, "iat" | "exp">): string {
    return jwtService.sign(claims, { secret: authConfig.jwtSecret, expiresIn: authConfig.accessTokenTtlSeconds });
  }

  /** Runs the real JwtAuthGuard -> RolesGuard chain for a given controller method, then calls it with the resolved claims - the same authorization path a real HTTP request to this exact method would go through. */
  async function callGuarded<T>(methodName: keyof WorkspaceMembershipController, token: string, ...args: unknown[]): Promise<T> {
    const request: { headers: { authorization: string }; user?: JwtPayload } = { headers: { authorization: `Bearer ${token}` } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => (controller[methodName] as unknown as (...a: unknown[]) => unknown),
      getClass: () => WorkspaceMembershipController,
    } as unknown as ExecutionContext;

    await jwtAuthGuard.canActivate(context);
    await rolesGuard.canActivate(context);
    const method = controller[methodName] as unknown as (...a: unknown[]) => Promise<T>;
    return method.apply(controller, [...args, request.user]);
  }

  const suffix = randomBytes(6).toString("hex");
  const orgId = newId();
  const workspaceId = newId();
  const otherWorkspaceId = newId();
  const ownerId = newId();
  const adminId = newId();
  const admin2Id = newId();
  const memberId = newId();
  const outsiderId = newId(); // member of otherWorkspaceId only
  const workspaceMemberIds: Record<string, string> = {};

  try {
    // --- Fixtures: one org, one workspace with owner+2 admins+member, a second unrelated workspace with its own member. ---
    await prisma.organization.create({ data: { id: orgId, name: `p161-${suffix}`, slug: `p161-${suffix}` } });
    await prisma.workspace.create({ data: { id: workspaceId, organizationId: orgId, name: "W1" } });
    await prisma.workspace.create({ data: { id: otherWorkspaceId, organizationId: orgId, name: "W2" } });
    for (const [label, id, ws, role] of [
      ["owner", ownerId, workspaceId, "owner"],
      ["admin", adminId, workspaceId, "admin"],
      ["admin2", admin2Id, workspaceId, "admin"],
      ["member", memberId, workspaceId, "member"],
      ["outsider", outsiderId, otherWorkspaceId, "owner"],
    ] as const) {
      await prisma.user.create({ data: { id, email: `p161-${label}-${suffix}@example.test` } });
      const m = await prisma.workspaceMember.create({ data: { id: newId(), workspaceId: ws, userId: id, role } });
      workspaceMemberIds[label] = m.id;
    }

    const ownerToken = signToken({ sub: ownerId, workspaceId, orgId, role: "owner", scopes: [] });
    const adminToken = signToken({ sub: adminId, workspaceId, orgId, role: "admin", scopes: [] });
    const memberToken = signToken({ sub: memberId, workspaceId, orgId, role: "member", scopes: [] });
    const outsiderToken = signToken({ sub: outsiderId, workspaceId: otherWorkspaceId, orgId, role: "owner", scopes: [] });

    // ============================================================
    // 1. Business workspace creation
    // ============================================================
    const created = await membershipService.createWorkspace(ownerId, orgId, "My Business", { ipAddress: null, userAgent: null });
    check("createWorkspace creates a new sibling workspace, not the caller's existing one", created.workspaceId !== workspaceId);
    const createdOwnerMembership = await prisma.workspaceMember.findFirst({ where: { workspaceId: created.workspaceId, userId: ownerId } });
    check("the creator becomes owner of the new workspace", createdOwnerMembership?.role === "owner");
    check("createWorkspace returns a usable access token for the new workspace", typeof created.accessToken === "string" && created.accessToken.length > 0);
    await prisma.$executeRaw`DELETE FROM workspace_members WHERE workspace_id = ${created.workspaceId}::uuid`;
    await prisma.$executeRaw`DELETE FROM workspaces WHERE id = ${created.workspaceId}::uuid`;
    await prisma.session.deleteMany({ where: { userId: ownerId } });

    // ============================================================
    // 2. Role authority, through the REAL guard chain (JwtAuthGuard -> RolesGuard -> controller)
    // ============================================================
    check(
      "a plain member cannot invite (RolesGuard rejects, not just the service)",
      await throwsWithCode(() => callGuarded("invite", memberToken, { role: "member" } as { role: "member" }), "INSUFFICIENT_ROLE"),
    );

    const inviteResult = await callGuarded<{ code: string }>("invite", adminToken, { role: "member" } as { role: "member" });
    check("an admin CAN invite", typeof inviteResult.code === "string" && inviteResult.code.length > 0);

    const newUserId = newId();
    await prisma.user.create({ data: { id: newUserId, email: `p161-invited-${suffix}@example.test` } });
    const acceptResult = await membershipService.acceptInvite(inviteResult.code, newUserId, { ipAddress: null, userAgent: null });
    check("accepting a valid invite creates a membership with the invite's role", acceptResult.role === "member");
    check("accept returns a token scoped to the invited workspace", acceptResult.workspaceId === workspaceId);

    check(
      "re-accepting the SAME code a second time fails (single-use)",
      await throwsWithCode(() => membershipService.acceptInvite(inviteResult.code, newUserId, { ipAddress: null, userAgent: null }), "INVITE_INVALID"),
    );

    const newMemberRow = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: newUserId } });

    check(
      "an admin can promote a plain member to admin",
      (await callGuarded<{ role: string }>("changeMemberRole", adminToken, newMemberRow!.id, { role: "admin" })).role === "admin",
    );
    check(
      "an admin CANNOT change the role of another admin (only plain members)",
      await throwsWithCode(() => callGuarded("changeMemberRole", adminToken, newMemberRow!.id, { role: "member" }), "INSUFFICIENT_ROLE"),
    );
    check(
      "the owner CAN demote that same admin back to member",
      (await callGuarded<{ role: string }>("changeMemberRole", ownerToken, newMemberRow!.id, { role: "member" })).role === "member",
    );
    check(
      "nobody (not even an admin acting on the owner) can change the OWNER's role via this endpoint",
      await throwsWithCode(() => callGuarded("changeMemberRole", adminToken, workspaceMemberIds.owner, { role: "admin" }), "OWNER_ROLE_IMMUTABLE_HERE"),
    );
    check(
      "the owner cannot remove themselves via this endpoint either (self-target blocked)",
      await throwsWithCode(() => callGuarded("changeMemberRole", ownerToken, workspaceMemberIds.owner, { role: "member" }), "CANNOT_CHANGE_OWN_ROLE"),
    );

    check(
      "an admin CANNOT remove the owner",
      await throwsWithCode(() => callGuarded("removeMember", adminToken, workspaceMemberIds.owner), "OWNER_CANNOT_BE_REMOVED"),
    );
    check(
      "an admin CANNOT remove another admin (only plain members)",
      await throwsWithCode(() => callGuarded("removeMember", adminToken, workspaceMemberIds.admin2), "INSUFFICIENT_ROLE"),
    );
    await callGuarded("removeMember", adminToken, newMemberRow!.id);
    check(
      "an admin CAN remove a plain member",
      (await prisma.workspaceMember.findFirst({ where: { id: newMemberRow!.id } })) === null,
    );

    // ============================================================
    // 3. Cross-workspace access - a target id from a DIFFERENT workspace must never resolve
    // ============================================================
    check(
      "removeMember targeting a member-id from a DIFFERENT workspace fails (not found in MY workspace)",
      await throwsWithCode(
        () => callGuarded("removeMember", ownerToken, workspaceMemberIds.outsider),
        "MEMBER_NOT_FOUND",
      ),
    );
    check(
      "an outsider's token (scoped to workspace 2) cannot act on workspace 1's members at all - RolesGuard sees their real role in THEIR workspace, but the service's own workspaceId scope is what actually blocks this",
      await throwsWithCode(
        () => callGuarded("removeMember", outsiderToken, workspaceMemberIds.member),
        "MEMBER_NOT_FOUND",
      ),
    );

    // ============================================================
    // 4. Last-owner protection
    // ============================================================
    check(
      "the sole owner of a workspace with other members cannot leave without transferring first",
      await throwsWithCode(() => membershipService.leave(workspaceId, ownerId), "WORKSPACE_HAS_OTHER_MEMBERS"),
    );
    {
      const soloWorkspaceId = newId();
      const soloUserId = newId();
      await prisma.workspace.create({ data: { id: soloWorkspaceId, organizationId: orgId, name: "Solo" } });
      await prisma.user.create({ data: { id: soloUserId, email: `p161-solo-${suffix}@example.test` } });
      await prisma.workspaceMember.create({ data: { id: newId(), workspaceId: soloWorkspaceId, userId: soloUserId, role: "owner" } });
      check(
        "a sole owner with NO other members cannot 'leave' either - directed at workspace deletion instead",
        await throwsWithCode(() => membershipService.leave(soloWorkspaceId, soloUserId), "SOLE_OWNER_CANNOT_LEAVE"),
      );
      await prisma.$executeRaw`DELETE FROM workspace_members WHERE workspace_id = ${soloWorkspaceId}::uuid`;
      await prisma.$executeRaw`DELETE FROM workspaces WHERE id = ${soloWorkspaceId}::uuid`;
    }
    await membershipService.leave(workspaceId, memberId);
    check(
      "a plain member CAN leave freely",
      (await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: memberId } })) === null,
    );
    // Restore for the transfer tests below.
    await prisma.workspaceMember.create({ data: { id: newId(), workspaceId, userId: memberId, role: "member" } });

    // ============================================================
    // 5. Atomic ownership transfer, including concurrency
    // ============================================================
    check(
      "transferOwnership rejects a non-owner actor",
      await throwsWithCode(() => membershipService.transferOwnership(workspaceId, adminId, memberId), "OWNER_ROLE_REQUIRED"),
    );
    check(
      "transferOwnership rejects a target who isn't already a member",
      await throwsWithCode(() => membershipService.transferOwnership(workspaceId, ownerId, newId()), "MEMBER_NOT_FOUND"),
    );

    {
      // Two concurrent transfer attempts for the SAME workspace, both
      // issued by the current owner, racing for two different targets.
      // The row-locked transaction must serialize them: exactly one
      // succeeds, the other's re-read finds the caller no longer owns
      // the workspace.
      const [r1, r2] = await Promise.allSettled([
        membershipService.transferOwnership(workspaceId, ownerId, adminId),
        membershipService.transferOwnership(workspaceId, ownerId, memberId),
      ]);
      const outcomes = [r1, r2];
      const succeeded = outcomes.filter((r) => r.status === "fulfilled").length;
      const failed = outcomes.filter((r) => r.status === "rejected");
      check("exactly one of two concurrent ownership transfers succeeds", succeeded === 1);
      check(
        "the loser fails with OWNER_ROLE_REQUIRED, never a partial/corrupted transfer",
        failed.length === 1 && (failed[0] as PromiseRejectedResult).reason?.response?.code === "OWNER_ROLE_REQUIRED",
      );

      const owners = await prisma.workspaceMember.findMany({ where: { workspaceId, role: "owner" } });
      check("the workspace has EXACTLY one owner after the race, never zero or two", owners.length === 1);
    }
  } finally {
    // Cleanup, FK-safe order, best-effort.
    await prisma.$executeRaw`DELETE FROM workspace_invites WHERE workspace_id = ${workspaceId}::uuid`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM workspace_members WHERE workspace_id IN (${workspaceId}::uuid, ${otherWorkspaceId}::uuid)`.catch(() => undefined);
    await prisma.session.deleteMany({ where: { userId: { in: [ownerId, adminId, admin2Id, memberId, outsiderId] } } }).catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM users WHERE id = ANY(${[ownerId, adminId, admin2Id, memberId, outsiderId]}::uuid[])`.catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: { contains: `p161-invited-${suffix}` } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: { contains: `p161-solo-${suffix}` } } }).catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM workspaces WHERE id IN (${workspaceId}::uuid, ${otherWorkspaceId}::uuid)`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${orgId}::uuid`.catch(() => undefined);
  }

  console.log(`\n${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
