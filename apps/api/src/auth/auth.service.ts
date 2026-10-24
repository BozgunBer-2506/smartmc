import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, newId } from "@smc/database";
import { AuditLogService } from "../audit/audit-log.service";
import { httpError } from "../common/http-error";
import { claimBetaInvite } from "./beta-invite.utils";
import { normalizeEmail, makeSlug, toPublicUser, type PublicUser } from "./auth.utils";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import { LoginThrottleService } from "./login-throttle.service";
import { PasswordService } from "./password.service";
import { SessionService, type RequestContext } from "./session.service";

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

/**
 * Registration/login/refresh/logout business logic (docs/ARCHITECTURE.md
 * Section 6, per ADR-0014). Token/session mechanics live in SessionService;
 * this class owns "who is allowed to have a session and why."
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly loginThrottle: LoginThrottleService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Creates a User + UserCredentials + a fresh Organization + Workspace +
   * an `owner` WorkspaceMember, all in one transaction - "even solo
   * signups get one automatically" (API.md Section 10.1), directly
   * serving ROADMAP.md Phase 2's "workspace auto-created for the first
   * user" Definition of Done.
   */
  async register(dto: RegisterDto, ctx: RequestContext): Promise<AuthResult> {
    const email = normalizeEmail(dto.email);
    const prisma = getPrismaClient();

    const policyErrors = this.passwordService.validatePolicy(dto.password);
    if (policyErrors.length > 0) {
      throw httpError(HttpStatus.BAD_REQUEST, "WEAK_PASSWORD", policyErrors.join(" "));
    }

    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
      throw httpError(
        HttpStatus.CONFLICT,
        "EMAIL_ALREADY_REGISTERED",
        "An account with this email already exists.",
      );
    }

    if (await this.passwordService.isKnownBreached(dto.password)) {
      throw httpError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "PASSWORD_BREACHED",
        "This password has appeared in a known data breach. Please choose a different one.",
      );
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { id: newId(), email, displayName: dto.displayName ?? null },
      });

      // Claimed right after the User row it references exists (the FK on
      // BetaInvite.usedByUserId requires that), but still inside the same
      // transaction as everything else: if anything later here fails
      // (e.g. a genuinely concurrent duplicate-email race hitting
      // User.email's unique constraint), Postgres rolls this claim back
      // too - the code stays usable rather than being silently burned by
      // a registration that never actually completed.
      await claimBetaInvite(tx, { code: dto.inviteCode, email, userId: user.id });

      await tx.userCredentials.create({
        data: { id: newId(), userId: user.id, passwordHash },
      });

      const organization = await tx.organization.create({
        data: {
          id: newId(),
          name: dto.displayName ? `${dto.displayName}'s Organization` : "My Organization",
          slug: makeSlug(dto.displayName ?? email.split("@")[0] ?? "workspace"),
        },
      });

      const workspace = await tx.workspace.create({
        data: { id: newId(), organizationId: organization.id, name: "Personal Workspace" },
      });

      const membership = await tx.workspaceMember.create({
        data: { id: newId(), workspaceId: workspace.id, userId: user.id, role: "owner" },
      });

      // A starter automation, not a hardcoded pipeline step (Phase 1-9 had
      // a stub rule engine that notified on every message unconditionally -
      // Phase 10 replaces that stub with the real Automation Engine, and
      // this is what its "notify on every message" behavior becomes: a
      // real, visible, disable-able Rule row instead of code every new
      // workspace can see and edit in Automations, matching
      // AUTOMATION_ENGINE.md's "inspectable, never magical" principle.
      await tx.rule.create({
        data: {
          id: newId(),
          workspaceId: workspace.id,
          createdByUserId: user.id,
          name: "Notify me on every message",
          isEnabled: true,
          priority: 0,
          triggerType: "message.received",
          trigger: { type: "message.received" },
          // Notify unless silent hours are active - unless the sender is
          // VIP-overridden or the message matches a configured keyword
          // alert (Phase 11, docs/DATABASE.md Section 6.14). With no
          // NotificationPreference row yet (the common case right after
          // registration), isSilentHours is always false, so this is
          // vacuously "always notify" until the user sets silent hours.
          conditions: {
            op: "OR",
            children: [
              { op: "NOT", children: [{ field: "workspace.isSilentHours", operator: "is_true" }] },
              { field: "workspace.isVipOverrideActive", operator: "is_true" },
              { field: "message.matchesKeywordAlert", operator: "is_true" },
            ],
          },
          actions: [
            {
              type: "notification.send",
              params: { title: "New message from {{sender.displayName}}", body: "{{message.bodyText}}" },
            },
          ],
        },
      });

      // A starter AI credit grant (Phase 13, ADR-0021) - the same
      // "working demo by default, explicitly disable-able" precedent the
      // starter rule above set for the automation engine. `Workspace.
      // aiEnabled` defaults `true` at the schema level; without any
      // credit, though, every AI endpoint would 402 immediately, which
      // isn't a useful default first-run experience.
      await tx.aiCreditLedger.create({
        data: { id: newId(), organizationId: organization.id, entryType: "grant", amount: 50, balanceAfter: 50, feature: "signup_grant" },
      });

      return { user, organizationId: organization.id, membership };
    });

    const tokens = await this.sessionService.issue(
      {
        userId: created.user.id,
        workspaceId: created.membership.workspaceId,
        orgId: created.organizationId,
        role: created.membership.role,
      },
      ctx,
    );

    await this.auditLog.log({
      workspaceId: created.membership.workspaceId,
      organizationId: created.organizationId,
      actorUserId: created.user.id,
      actorType: "user",
      action: "user.registered",
      resourceType: "user",
      resourceId: created.user.id,
      ipAddress: ctx.ipAddress,
    });

    return {
      user: toPublicUser(created.user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async login(dto: LoginDto, ctx: RequestContext): Promise<AuthResult> {
    const email = normalizeEmail(dto.email);
    const prisma = getPrismaClient();

    if (await this.loginThrottle.isLocked(email, ctx.ipAddress)) {
      throw httpError(
        HttpStatus.TOO_MANY_REQUESTS,
        "ACCOUNT_LOCKED",
        "Too many failed login attempts. Please try again later.",
      );
    }

    const user = await prisma.user.findFirst({ where: { email }, include: { credentials: true } });
    const passwordOk = user?.credentials?.passwordHash
      ? await this.passwordService.verify(user.credentials.passwordHash, dto.password)
      : false;

    if (!user || !passwordOk) {
      await this.loginThrottle.recordFailure(email, ctx.ipAddress);
      await this.auditLog.log({
        actorUserId: user?.id ?? null,
        actorType: "user",
        action: "user.login_failed",
        resourceType: "user",
        ipAddress: ctx.ipAddress,
        metadata: { email },
      });
      throw httpError(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    await this.loginThrottle.reset(email, ctx.ipAddress);

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      orderBy: { joinedAt: "asc" },
      include: { workspace: true },
    });

    if (!membership) {
      // Every user created via register() always gets one - defensive,
      // not an expected runtime path.
      throw httpError(HttpStatus.FORBIDDEN, "NO_WORKSPACE", "This account has no workspace.");
    }

    const tokens = await this.sessionService.issue(
      {
        userId: user.id,
        workspaceId: membership.workspaceId,
        orgId: membership.workspace.organizationId,
        role: membership.role,
      },
      ctx,
    );

    await this.auditLog.log({
      workspaceId: membership.workspaceId,
      organizationId: membership.workspace.organizationId,
      actorUserId: user.id,
      actorType: "user",
      action: "user.login_succeeded",
      resourceType: "user",
      resourceId: user.id,
      ipAddress: ctx.ipAddress,
    });

    return { user: toPublicUser(user), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  /**
   * Phase 16.1 security-audit fix: the workspace is read from
   * `session.workspaceId` - the exact workspace this refresh-token
   * family was issued for (SessionService.issue()/rotate()) - never
   * re-derived by "the user's oldest membership". Re-deriving it that
   * way was a real, confirmed bug: it silently reverted a multi-workspace
   * user back to their first-ever workspace on every refresh, regardless
   * of which workspace their session actually represented. Only the
   * ROLE is re-resolved here (it can legitimately change between
   * refreshes - a promotion, a demotion, a transfer), never the
   * workspace itself.
   *
   * Fail-closed: if the membership for `session.workspaceId` no longer
   * exists (removed from that specific workspace, or the account was
   * deleted - WorkspaceMember.userId is RESTRICT to User, so the two
   * cases are indistinguishable and both correctly rejected the same
   * way JwtAuthGuard's own equivalent check already does), the refresh
   * is rejected outright - never silently falls back to a different
   * workspace the caller didn't ask for.
   */
  async refresh(presentedRefreshToken: string, ctx: RequestContext): Promise<{ accessToken: string; refreshToken: string }> {
    const { userId, refreshToken, session } = await this.sessionService.rotate(presentedRefreshToken, ctx);

    const prisma = getPrismaClient();
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: session.workspaceId, userId },
      include: { workspace: true },
    });

    if (!membership) {
      throw httpError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHENTICATED",
        "This account no longer has access to this workspace.",
      );
    }

    const accessToken = this.sessionService.signAccessToken({
      userId,
      workspaceId: membership.workspaceId,
      orgId: membership.workspace.organizationId,
      role: membership.role,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Phase 16.1 frontend-integration step - moves the CALLER'S OWN
   * current session into a different workspace they already belong to.
   * Authorization happens before any session mechanics run: membership
   * in `targetWorkspaceId` is verified first (fail-closed, no session
   * is touched at all if it fails), then the switch itself reuses
   * `SessionService.rotate()` exactly as `refresh()` does - same
   * reuse-detection, same family, same revoke-old-row-first mechanics -
   * just with `targetWorkspaceId` instead of the session's existing
   * workspace carried onto the new row. No separate "session for a
   * workspace I'm not actually in" state can exist even transiently -
   * the old row is already revoked and the new one already carries the
   * verified target by the time this returns.
   *
   * `userId` must be the CALLER'S OWN id, from their already-verified
   * access token (JwtAuthGuard/`claims.sub`), never trusted from the
   * refresh cookie alone. Passed into `SessionService.rotate()` as
   * `expectedUserId` (ordering fix, found during review of this exact
   * method before the frontend integration step) - a refresh cookie that
   * doesn't actually belong to the same user as the presented access
   * token is rejected by `rotate()` itself, BEFORE any session is
   * touched, not after one has already been silently rotated out from
   * under its real owner.
   */
  async switchWorkspace(
    userId: string,
    targetWorkspaceId: string,
    presentedRefreshToken: string,
    ctx: RequestContext,
  ): Promise<{ accessToken: string; refreshToken: string; workspaceId: string }> {
    const prisma = getPrismaClient();
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: targetWorkspaceId, userId },
      include: { workspace: true },
    });

    if (!membership) {
      throw httpError(HttpStatus.FORBIDDEN, "NOT_A_WORKSPACE_MEMBER", "You are not a member of this workspace.");
    }

    const { refreshToken } = await this.sessionService.rotate(presentedRefreshToken, ctx, targetWorkspaceId, userId);

    const accessToken = this.sessionService.signAccessToken({
      userId,
      workspaceId: targetWorkspaceId,
      orgId: membership.workspace.organizationId,
      role: membership.role,
    });

    return { accessToken, refreshToken, workspaceId: targetWorkspaceId };
  }

  async logout(presentedRefreshToken: string, ctx: RequestContext): Promise<void> {
    const result = await this.sessionService.revoke(presentedRefreshToken);
    if (result) {
      await this.auditLog.log({
        actorUserId: result.userId,
        actorType: "user",
        action: "user.logout",
        resourceType: "session",
        ipAddress: ctx.ipAddress,
      });
    }
  }

  async logoutAll(userId: string, ctx: RequestContext): Promise<void> {
    await this.sessionService.revokeAllForUser(userId);
    await this.auditLog.log({
      actorUserId: userId,
      actorType: "user",
      action: "user.logout_all",
      resourceType: "user",
      resourceId: userId,
      ipAddress: ctx.ipAddress,
    });
  }

  async listSessions(userId: string) {
    return this.sessionService.listActiveForUser(userId);
  }
}
