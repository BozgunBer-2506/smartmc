/**
 * Regression checks for the Phase 16.1 frontend-integration step:
 * 1. GET /v1/users/me exposes currentWorkspaceId from the live JWT claims.
 * 2. POST /v1/auth/switch-workspace rotates the current session into a
 *    workspace the caller already belongs to, via the existing
 *    SessionService.rotate() mechanics - same family, same
 *    reuse-detection, no new session machinery.
 * 3. Unauthorized workspace selection fails closed BEFORE touching the
 *    session at all (the original refresh token survives untouched).
 * 4. A switched session still fails closed on refresh once its
 *    membership is removed - the same invariant the prior security fix
 *    already proved for a plain (non-switched) session.
 * 5. Concurrent refresh vs. switch using the same refresh token.
 * 6. A refresh token belonging to a DIFFERENT user than the caller's
 *    access token is rejected with zero side effect - the ordering fix
 *    found during review before the frontend integration step.
 *
 * Runs directly against the local dev Postgres - no live API server
 * needed. Every row created is deleted at the end, FK-safe order,
 * regardless of pass/fail.
 */
import "reflect-metadata";
import { createHash, randomBytes } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { getPrismaClient, newId } from "@smc/database";
import { AuditLogService } from "../apps/api/src/audit/audit-log.service";
import { AuthService } from "../apps/api/src/auth/auth.service";
import { LoginThrottleService } from "../apps/api/src/auth/login-throttle.service";
import { PasswordService } from "../apps/api/src/auth/password.service";
import { SessionService } from "../apps/api/src/auth/session.service";
import { UsersController } from "../apps/api/src/users/users.controller";
import type { JwtPayload } from "../apps/api/src/auth/jwt-payload";

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
  const auditLog = new AuditLogService();
  const sessionService = new SessionService(jwtService, auditLog);
  const authService = new AuthService(new PasswordService(), sessionService, new LoginThrottleService(), auditLog);

  const suffix = randomBytes(6).toString("hex");
  const orgId = newId();
  const workspaceAId = newId();
  const workspaceBId = newId();
  const outsideWorkspaceId = newId(); // userId is NOT a member of this one
  const userId = newId();

  try {
    await prisma.organization.create({ data: { id: orgId, name: `p161sw-${suffix}`, slug: `p161sw-${suffix}` } });
    await prisma.workspace.create({ data: { id: workspaceAId, organizationId: orgId, name: "A" } });
    await prisma.workspace.create({ data: { id: workspaceBId, organizationId: orgId, name: "B" } });
    await prisma.workspace.create({ data: { id: outsideWorkspaceId, organizationId: orgId, name: "Outside" } });
    await prisma.user.create({ data: { id: userId, email: `p161sw-${suffix}@example.test` } });
    await prisma.workspaceMember.create({ data: { id: newId(), workspaceId: workspaceAId, userId, role: "owner" } });
    await prisma.workspaceMember.create({ data: { id: newId(), workspaceId: workspaceBId, userId, role: "admin" } });

    // ============================================================
    // 1. GET /v1/users/me's currentWorkspaceId
    // ============================================================
    // AccountDeletionService is never touched by `me()` - a dummy
    // satisfies the constructor without building its whole dependency
    // chain just to exercise an unrelated method.
    const usersController = new UsersController({} as never);
    const meResult = await usersController.me({ sub: userId, workspaceId: workspaceAId, orgId, role: "owner", scopes: [], iat: 0, exp: 0 } as JwtPayload);
    check("GET /v1/users/me's currentWorkspaceId matches the caller's own token claim", meResult.currentWorkspaceId === workspaceAId);
    check("GET /v1/users/me still lists every membership (both A and B), unchanged by this addition", meResult.workspaces.length === 2);

    // ============================================================
    // 2. Switching into a workspace you actually belong to
    // ============================================================
    const issuedA = await sessionService.issue({ userId, workspaceId: workspaceAId, orgId, role: "owner" }, { ipAddress: null, userAgent: null });
    check("session is issued scoped to workspace A", issuedA.session.workspaceId === workspaceAId);

    const switched = await authService.switchWorkspace(userId, workspaceBId, issuedA.refreshToken, { ipAddress: null, userAgent: null });
    const switchedClaims = jwtService.decode(switched.accessToken) as { workspaceId: string; role: string };
    check("switch-workspace returns an access token scoped to the TARGET workspace", switchedClaims.workspaceId === workspaceBId);
    check("switch-workspace returns the caller's CURRENT role in the target workspace", switchedClaims.role === "admin");

    const sessionAfterSwitch = await prisma.session.findFirst({ where: { refreshTokenHash: createHash("sha256").update(switched.refreshToken).digest("hex") } });
    check("the new session row persists the target workspace, not the original one", sessionAfterSwitch?.workspaceId === workspaceBId);

    check(
      "the OLD (pre-switch) refresh token is now revoked - reusing it is detected as reuse, same as a normal refresh rotation",
      await throwsWithCode(() => authService.refresh(issuedA.refreshToken, { ipAddress: null, userAgent: null }), "REFRESH_TOKEN_REUSE_DETECTED"),
    );
    // Reuse-detection revokes the WHOLE family, including the just-issued
    // switched token - re-establish a clean session for the remaining checks.
    const reIssuedB = await sessionService.issue({ userId, workspaceId: workspaceBId, orgId, role: "admin" }, { ipAddress: null, userAgent: null });

    // ============================================================
    // 3. Unauthorized workspace selection - fails BEFORE touching the session
    // ============================================================
    check(
      "switching into a workspace the caller is NOT a member of is rejected",
      await throwsWithCode(
        () => authService.switchWorkspace(userId, outsideWorkspaceId, reIssuedB.refreshToken, { ipAddress: null, userAgent: null }),
        "NOT_A_WORKSPACE_MEMBER",
      ),
    );
    const refreshAfterFailedSwitch = await authService.refresh(reIssuedB.refreshToken, { ipAddress: null, userAgent: null });
    const claimsAfterFailedSwitch = jwtService.decode(refreshAfterFailedSwitch.accessToken) as { workspaceId: string };
    check(
      "the original session is completely untouched by a rejected switch attempt - a normal refresh afterward still works, still scoped to B",
      claimsAfterFailedSwitch.workspaceId === workspaceBId,
    );

    // ============================================================
    // 4. Membership removed after a switch -> refresh fails closed
    // ============================================================
    await prisma.$executeRaw`DELETE FROM workspace_members WHERE workspace_id = ${workspaceBId}::uuid AND user_id = ${userId}::uuid`;
    check(
      "refresh fails closed once the SWITCHED-TO workspace's membership is removed",
      await throwsWithCode(() => authService.refresh(refreshAfterFailedSwitch.refreshToken, { ipAddress: null, userAgent: null }), "UNAUTHENTICATED"),
    );
    // Restore for the concurrency check below.
    await prisma.workspaceMember.create({ data: { id: newId(), workspaceId: workspaceBId, userId, role: "admin" } });

    // ============================================================
    // 5. Concurrent refresh vs. switch on the SAME refresh token
    // ============================================================
    const issuedForRace = await sessionService.issue({ userId, workspaceId: workspaceAId, orgId, role: "owner" }, { ipAddress: null, userAgent: null });
    const [raceRefresh, raceSwitch] = await Promise.allSettled([
      authService.refresh(issuedForRace.refreshToken, { ipAddress: null, userAgent: null }),
      authService.switchWorkspace(userId, workspaceBId, issuedForRace.refreshToken, { ipAddress: null, userAgent: null }),
    ]);
    const raceOutcomes = [raceRefresh, raceSwitch].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ accessToken: string }>[];
    check("at least one of a concurrent refresh/switch pair on the same token succeeds", raceOutcomes.length >= 1);
    for (const outcome of raceOutcomes) {
      const decoded = jwtService.decode(outcome.value.accessToken) as { workspaceId: string };
      check(
        `a successful outcome's workspace is one of the two legitimate workspaces (A or B), never a mismatch or a third value - got ${decoded.workspaceId}`,
        decoded.workspaceId === workspaceAId || decoded.workspaceId === workspaceBId,
      );
    }

    // ============================================================
    // 6. Ordering fix: presenting someone ELSE's refresh token must never
    //    mutate THEIR session, even if the caller is independently a
    //    legitimate member of the target workspace.
    // ============================================================
    const victimId = newId();
    await prisma.user.create({ data: { id: victimId, email: `p161sw-victim-${suffix}@example.test` } });
    await prisma.workspaceMember.create({ data: { id: newId(), workspaceId: workspaceAId, userId: victimId, role: "member" } });
    const victimSession = await sessionService.issue({ userId: victimId, workspaceId: workspaceAId, orgId, role: "member" }, { ipAddress: null, userAgent: null });

    check(
      "switchWorkspace(callerId, target, VICTIM'S refresh token) is rejected as SESSION_MISMATCH",
      await throwsWithCode(
        () => authService.switchWorkspace(userId, workspaceBId, victimSession.refreshToken, { ipAddress: null, userAgent: null }),
        "SESSION_MISMATCH",
      ),
    );
    const victimSessionRowAfter = await prisma.session.findFirst({
      where: { refreshTokenHash: createHash("sha256").update(victimSession.refreshToken).digest("hex") },
    });
    check(
      "the victim's session row is NEITHER revoked NOR replaced by the rejected cross-user attempt",
      victimSessionRowAfter !== null && victimSessionRowAfter.revokedAt === null,
    );
    const victimStillRefreshes = await authService.refresh(victimSession.refreshToken, { ipAddress: null, userAgent: null });
    const victimClaimsAfter = jwtService.decode(victimStillRefreshes.accessToken) as { workspaceId: string };
    check(
      "the victim's ORIGINAL refresh token still works normally afterward, still scoped to their own workspace",
      victimClaimsAfter.workspaceId === workspaceAId,
    );
  } finally {
    const victimEmailPattern = `p161sw-victim-${suffix}@example.test`;
    await prisma.session.deleteMany({ where: { workspaceId: { in: [workspaceAId, workspaceBId, outsideWorkspaceId] } } }).catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM workspace_members WHERE workspace_id IN (${workspaceAId}::uuid, ${workspaceBId}::uuid, ${outsideWorkspaceId}::uuid)`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${userId}::uuid`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM users WHERE email = ${victimEmailPattern}`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM workspaces WHERE id IN (${workspaceAId}::uuid, ${workspaceBId}::uuid, ${outsideWorkspaceId}::uuid)`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${orgId}::uuid`.catch(() => undefined);
  }

  console.log(`\n${passCount} passed, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
