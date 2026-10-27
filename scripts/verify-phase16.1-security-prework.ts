/**
 * Regression checks for the three Phase 16.1 pre-work security fixes:
 * 1. JwtAuthGuard rejects a removed WorkspaceMember and always attaches
 *    the membership's CURRENT role, never the token's stale `role` claim.
 * 2. Push subscription unsubscribe is scoped to (workspaceId, userId) -
 *    a cross-workspace delete by endpoint alone must not remove it.
 * 3. CredentialsStore getSecret/deleteSecret verify SecretRecord
 *    ownership via LinkedAccount before acting, fail-closed.
 *
 * Runs directly against the local dev Postgres (same DATABASE_URL every
 * other verify-*.ts script and `pnpm dev` use) - no live API server
 * needed, no new dependency. Every row this script creates is deleted at
 * the end, in FK-safe order, regardless of pass/fail.
 */
import "reflect-metadata";
import { randomBytes } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import { getPrismaClient, newId } from "@smc/database";
import { authConfig } from "../apps/api/src/config/auth.config";
import { JwtAuthGuard } from "../apps/api/src/auth/jwt-auth.guard";
import { TokenService } from "../apps/api/src/auth/token.service";
import type { JwtPayload } from "../apps/api/src/auth/jwt-payload";
import { PushService } from "../apps/api/src/push/push.service";
import { CredentialsStoreService } from "../apps/api/src/credentials-store/credentials-store.service";
import { AuditLogService } from "../apps/api/src/audit/audit-log.service";
import type { ExecutionContext } from "@nestjs/common";

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

async function throws(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

function fakeContext(authorizationHeader: string | undefined): { context: ExecutionContext; request: { user?: JwtPayload } } {
  const request: { headers: { authorization?: string }; user?: JwtPayload } = { headers: { authorization: authorizationHeader } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

async function main() {
  const prisma = getPrismaClient();
  const jwtService = new JwtService();
  const tokenService = new TokenService(jwtService);
  const guard = new JwtAuthGuard(tokenService);
  const pushService = new PushService();
  const credentialsStore = new CredentialsStoreService(new AuditLogService());

  const suffix = randomBytes(6).toString("hex");
  const orgId = newId();
  const workspaceAId = newId();
  const workspaceBId = newId();
  const userId = newId();
  const providerId = newId();
  let linkedAccountId: string | undefined;
  let secretRef: string | undefined;

  function signToken(claims: Omit<JwtPayload, "iat" | "exp">): string {
    return jwtService.sign(claims, { secret: authConfig.jwtSecret, expiresIn: authConfig.accessTokenTtlSeconds });
  }

  try {
    // --- Fixture setup: one org, two workspaces, one user, one owner membership in workspace A. ---
    await prisma.organization.create({ data: { id: orgId, name: `sec-prework-${suffix}`, slug: `sec-prework-${suffix}` } });
    await prisma.workspace.create({ data: { id: workspaceAId, organizationId: orgId, name: "A" } });
    await prisma.workspace.create({ data: { id: workspaceBId, organizationId: orgId, name: "B" } });
    await prisma.user.create({ data: { id: userId, email: `sec-prework-${suffix}@example.test` } });
    await prisma.workspaceMember.create({ data: { id: newId(), workspaceId: workspaceAId, userId, role: "owner" } });

    // ============================================================
    // 1. JwtAuthGuard - membership presence + role freshness
    // ============================================================
    const tokenAsOwner = signToken({ sub: userId, workspaceId: workspaceAId, orgId, role: "owner", scopes: [] });

    {
      const { context, request } = fakeContext(`Bearer ${tokenAsOwner}`);
      const allowed = await guard.canActivate(context);
      check("valid membership is allowed through", allowed === true);
      check("request.user.role reflects the DB membership role", request.user?.role === "owner");
    }

    // Demote in the DB without issuing a new token - the OLD token still claims "owner".
    await prisma.workspaceMember.updateMany({ where: { workspaceId: workspaceAId, userId }, data: { role: "member" } });
    {
      const { context, request } = fakeContext(`Bearer ${tokenAsOwner}`);
      await guard.canActivate(context);
      check(
        "a role demotion in the DB is reflected immediately, even with a stale 'owner'-claiming token (RolesGuard never sees the old role)",
        request.user?.role === "member",
      );
    }

    // Promote back, confirm the same freshness in the other direction.
    await prisma.workspaceMember.updateMany({ where: { workspaceId: workspaceAId, userId }, data: { role: "admin" } });
    {
      const { context, request } = fakeContext(`Bearer ${tokenAsOwner}`);
      await guard.canActivate(context);
      check("a role promotion is also reflected immediately from the same stale token", request.user?.role === "admin");
    }

    // Remove the membership entirely - fail-closed. Raw DELETE, same as
    // account-deletion.service.ts/workspace-deletion.service.ts: WorkspaceMember
    // is soft-delete-intercepted, and this test needs the row actually gone
    // (including freeing its (workspace_id, user_id) unique constraint for
    // the restore below), not just `deletedAt` set.
    await prisma.$executeRaw`DELETE FROM workspace_members WHERE workspace_id = ${workspaceAId}::uuid AND user_id = ${userId}::uuid`;
    {
      const { context } = fakeContext(`Bearer ${tokenAsOwner}`);
      check("a removed WorkspaceMember is rejected (fail-closed), even with a signature-valid, unexpired token", await throws(() => guard.canActivate(context)));
    }

    // A token for a workspace the user was never a member of at all.
    const tokenForWrongWorkspace = signToken({ sub: userId, workspaceId: workspaceBId, orgId, role: "owner", scopes: [] });
    {
      const { context } = fakeContext(`Bearer ${tokenForWrongWorkspace}`);
      check("a token claiming a workspace the user never belonged to is rejected", await throws(() => guard.canActivate(context)));
    }

    // Restore membership for the remaining checks below (push/credentials don't need this guard, but keep fixtures tidy).
    await prisma.workspaceMember.create({ data: { id: newId(), workspaceId: workspaceAId, userId, role: "owner" } });

    // ============================================================
    // 2. Push subscriptions - cross-workspace unsubscribe must not delete
    // ============================================================
    const endpoint = `https://push.example.test/${suffix}`;
    await pushService.subscribe(workspaceAId, userId, { endpoint, keys: { p256dh: "p256dh-test", auth: "auth-test" } });

    await pushService.unsubscribe(workspaceBId, userId, endpoint); // wrong workspace
    const stillThere = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    check("unsubscribe from the WRONG workspace does not delete another workspace's subscription", stillThere !== null);

    await pushService.unsubscribe(workspaceAId, userId, endpoint); // correct workspace
    const goneNow = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    check("unsubscribe from the CORRECT (workspace, user) deletes it", goneNow === null);

    // ============================================================
    // 3. CredentialsStore - SecretRecord ownership via LinkedAccount
    // ============================================================
    await prisma.provider.create({ data: { id: providerId, key: `sec-prework-${suffix}`, displayName: "Security Prework Test" } });

    const { ref } = await credentialsStore.putSecret("super-secret-bot-token");
    secretRef = ref;

    check(
      "getSecret fails closed for a ref with no owning LinkedAccount in ANY workspace yet",
      await throws(() => credentialsStore.getSecret(ref, { workspaceId: workspaceAId, actorType: "system", audit: false })),
    );

    const linkedAccount = await prisma.linkedAccount.create({
      data: {
        id: newId(),
        workspaceId: workspaceAId,
        providerId,
        externalAccountId: `ext-${suffix}`,
        status: "active",
        credentialsRef: ref,
      },
    });
    linkedAccountId = linkedAccount.id;

    const plaintext = await credentialsStore.getSecret(ref, { workspaceId: workspaceAId, actorType: "system", audit: false });
    check("getSecret succeeds for the workspace that actually owns the LinkedAccount", plaintext === "super-secret-bot-token");

    check(
      "getSecret fails closed when called with a DIFFERENT workspace's id",
      await throws(() => credentialsStore.getSecret(ref, { workspaceId: workspaceBId, actorType: "system", audit: false })),
    );

    check(
      "deleteSecret with the WRONG workspace does not delete the secret",
      await throws(() => credentialsStore.deleteSecret(ref, workspaceBId)),
    );
    const stillDecryptable = await credentialsStore.getSecret(ref, { workspaceId: workspaceAId, actorType: "system", audit: false });
    check("the secret is still intact after the failed wrong-workspace delete attempt", stillDecryptable === "super-secret-bot-token");

    await credentialsStore.deleteSecret(ref, workspaceAId);
    check(
      "deleteSecret with the CORRECT workspace actually deletes it",
      await throws(() => credentialsStore.getSecret(ref, { workspaceId: workspaceAId, actorType: "system", audit: false })),
    );
    secretRef = undefined; // already gone - cleanup below must not try again
  } finally {
    // Cleanup, FK-safe order, best-effort (a failed assertion above must never leave test data behind).
    await prisma.pushSubscription.deleteMany({ where: { userId } }).catch(() => undefined);
    if (linkedAccountId) await prisma.$executeRaw`DELETE FROM linked_accounts WHERE id = ${linkedAccountId}::uuid`.catch(() => undefined);
    if (secretRef) await prisma.secretRecord.delete({ where: { id: secretRef } }).catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM providers WHERE id = ${providerId}::uuid`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM workspace_members WHERE user_id = ${userId}::uuid`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${userId}::uuid`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM workspaces WHERE id = ${workspaceAId}::uuid`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM workspaces WHERE id = ${workspaceBId}::uuid`.catch(() => undefined);
    await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${orgId}::uuid`.catch(() => undefined);
  }

  console.log(`\n${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
