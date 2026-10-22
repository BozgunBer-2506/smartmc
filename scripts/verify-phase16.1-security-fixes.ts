/**
 * Regression checks for the Phase 16.1 security-audit fixes:
 * 1. Session.workspaceId - refresh/login never silently switch a
 *    session's workspace; a removed membership fails refresh closed;
 *    migration-backfilled (pre-fix) sessions keep working.
 * 2. acceptInvite's concurrent-accept race resolves to a clean
 *    ALREADY_MEMBER (409), not a raw Prisma error.
 * 3. TransferOwnershipDto rejects a non-UUID userId.
 *
 * Runs directly against the local dev Postgres - no live API server
 * needed. Every row created is deleted at the end, FK-safe order,
 * regardless of pass/fail.
 */
import "reflect-metadata";
import { createHash, randomBytes } from "node:crypto";
import { validate } from "class-validator";
import { JwtService } from "@nestjs/jwt";
import { getPrismaClient, newId } from "@smc/database";
import { AuditLogService } from "../apps/api/src/audit/audit-log.service";
import { AuthService } from "../apps/api/src/auth/auth.service";
import { LoginThrottleService } from "../apps/api/src/auth/login-throttle.service";
import { PasswordService } from "../apps/api/src/auth/password.service";
import { SessionService } from "../apps/api/src/auth/session.service";
import { TransferOwnershipDto } from "../apps/api/src/workspaces/dto/transfer-ownership.dto";
import { WorkspaceMembershipService } from "../apps/api/src/workspaces/workspace-membership.service";
import { RealtimeGateway } from "../apps/api/src/realtime/realtime.gateway";
import { TokenService } from "../apps/api/src/auth/token.service";

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

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function main() {
  const prisma = getPrismaClient();
  const jwtService = new JwtService();
  const auditLog = new AuditLogService();
  const sessionService = new SessionService(jwtService, auditLog);
  const authService = new AuthService(new PasswordService(), sessionService, new LoginThrottleService(), auditLog);
  const tokenService = new TokenService(jwtService);
  const realtimeGateway = new RealtimeGateway(tokenService);
  const membershipService = new WorkspaceMembershipService(sessionService, auditLog, realtimeGateway);

  const suffix = randomBytes(6).toString("hex");
  const orgId = newId();
  const workspaceAId = newId();
  const workspaceBId = newId();
  const userId = newId();

  try {
    // ============================================================
    // 1. Multi-workspace session continuity
    // ============================================================
    await prisma.organization.create({ data: { id: orgId, name: `p161fix-${suffix}`, slug: `p161fix-${suffix}` } });
    await prisma.workspace.create({ data: { id: workspaceAId, organizationId: orgId, name: "A (older)" } });
    await prisma.workspace.create({ data: { id: workspaceBId, organizationId: orgId, name: "B (newer)" } });
    await prisma.user.create({ data: { id: userId, email: `p161fix-${suffix}@example.test` } });
    // A is the OLDER membership (created first) - the exact case the old
    // "orderBy: joinedAt asc" bug would have reverted every refresh to.
    await prisma.workspaceMember.create({ data: { id: newId(), workspaceId: workspaceAId, userId, role: "owner" } });
    await new Promise((r) => setTimeout(r, 10));
    await prisma.workspaceMember.create({ data: { id: newId(), workspaceId: workspaceBId, userId, role: "owner" } });

    // Issue a session for the NEWER workspace B (as login()/createWorkspace() would).
    const issuedB = await sessionService.issue({ userId, workspaceId: workspaceBId, orgId, role: "owner" }, { ipAddress: null, userAgent: null });
    check("a freshly issued session persists the workspace it was actually issued for", issuedB.session.workspaceId === workspaceBId);

    const refresh1 = await authService.refresh(issuedB.refreshToken, { ipAddress: null, userAgent: null });
    const claimsAfterRefresh1 = jwtService.decode(refresh1.accessToken) as { workspaceId: string };
    check(
      "refresh #1 stays on workspace B - never silently reverts to the OLDER workspace A",
      claimsAfterRefresh1.workspaceId === workspaceBId,
    );

    const refresh2 = await authService.refresh(refresh1.refreshToken, { ipAddress: null, userAgent: null });
    const claimsAfterRefresh2 = jwtService.decode(refresh2.accessToken) as { workspaceId: string };
    check("refresh #2 (a second, sequential rotation) still stays on workspace B", claimsAfterRefresh2.workspaceId === workspaceBId);

    // ============================================================
    // 2. Migration-backfilled (pre-fix) sessions keep working
    // ============================================================
    const legacyPlainToken = randomBytes(32).toString("base64url");
    await prisma.session.create({
      data: {
        id: newId(),
        userId,
        workspaceId: workspaceAId, // as the backfill UPDATE would have set it
        refreshTokenHash: hashRefreshToken(legacyPlainToken),
        familyId: newId(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });
    const legacyRefresh = await authService.refresh(legacyPlainToken, { ipAddress: null, userAgent: null });
    const legacyClaims = jwtService.decode(legacyRefresh.accessToken) as { workspaceId: string };
    check(
      "a migration-backfilled session (simulating a pre-fix Personal session) still refreshes successfully, scoped to its backfilled workspace",
      legacyClaims.workspaceId === workspaceAId,
    );

    // ============================================================
    // 3. Removed membership -> refresh fails closed
    // ============================================================
    await prisma.$executeRaw`DELETE FROM workspace_members WHERE workspace_id = ${workspaceBId}::uuid AND user_id = ${userId}::uuid`;
    check(
      "refresh fails closed (UNAUTHENTICATED) once the session's workspace membership is removed",
      await throwsWithCode(() => authService.refresh(refresh2.refreshToken, { ipAddress: null, userAgent: null }), "UNAUTHENTICATED"),
    );

    // ============================================================
    // 4. Concurrent invite acceptance -> clean ALREADY_MEMBER, not a raw 500
    // ============================================================
    const invitedUserId = newId();
    await prisma.user.create({ data: { id: invitedUserId, email: `p161fix-invited-${suffix}@example.test` } });
    const ownerIdForInvites = newId();
    await prisma.user.create({ data: { id: ownerIdForInvites, email: `p161fix-owner-${suffix}@example.test` } });
    await prisma.workspaceMember.create({ data: { id: newId(), workspaceId: workspaceAId, userId: ownerIdForInvites, role: "owner" } });

    const inviteOne = await membershipService.invite(workspaceAId, ownerIdForInvites, { role: "member" });
    const inviteTwo = await membershipService.invite(workspaceAId, ownerIdForInvites, { role: "admin" });

    const [acceptOne, acceptTwo] = await Promise.allSettled([
      membershipService.acceptInvite(inviteOne.code, invitedUserId, { ipAddress: null, userAgent: null }),
      membershipService.acceptInvite(inviteTwo.code, invitedUserId, { ipAddress: null, userAgent: null }),
    ]);
    const succeeded = [acceptOne, acceptTwo].filter((r) => r.status === "fulfilled");
    const failed = [acceptOne, acceptTwo].filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    check("exactly one of two concurrently-accepted invites for the same person succeeds", succeeded.length === 1);
    check(
      "the loser gets a clean ALREADY_MEMBER (409), never a raw unhandled database error",
      failed.length === 1 && failed[0].reason?.response?.code === "ALREADY_MEMBER",
    );

    // ============================================================
    // 5. TransferOwnershipDto UUID validation
    // ============================================================
    const badDto = new TransferOwnershipDto();
    (badDto as unknown as { userId: string }).userId = "not-a-uuid";
    const badErrors = await validate(badDto);
    check("TransferOwnershipDto rejects a non-UUID userId", badErrors.some((e) => e.property === "userId"));

    const goodDto = new TransferOwnershipDto();
    (goodDto as unknown as { userId: string }).userId = newId();
    const goodErrors = await validate(goodDto);
    check("TransferOwnershipDto accepts a real UUID userId", goodErrors.length === 0);
  } finally {
    // Cleanup, FK-safe order (sessions before workspaces - Session.workspaceId
    // is RESTRICT, Session.userId is RESTRICT too) - scoped by workspace, not
    // just the main `userId`, since acceptInvite() also issues a session for
    // the invited user in section 4.
    await prisma.session.deleteMany({ where: { workspaceId: { in: [workspaceAId, workspaceBId] } } }).catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM workspace_invites WHERE workspace_id IN (${workspaceAId}::uuid, ${workspaceBId}::uuid)`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM workspace_members WHERE workspace_id IN (${workspaceAId}::uuid, ${workspaceBId}::uuid)`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`p161fix-%-${suffix}@example.test`}`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${userId}::uuid`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM workspaces WHERE id IN (${workspaceAId}::uuid, ${workspaceBId}::uuid)`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${orgId}::uuid`.catch(() => undefined);
  }

  console.log(`\n${passCount} passed, ${failCount} failed`);
  // LoginThrottleService opens its own ioredis connection at construction
  // time, which otherwise keeps the event loop (and this process) alive
  // indefinitely after main() returns - force-exit explicitly either way.
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
