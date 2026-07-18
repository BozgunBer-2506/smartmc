import { HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient, newId } from "@smc/database";
import { AuditLogService } from "../audit/audit-log.service";
import { authError } from "./auth.exceptions";
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
      throw authError(HttpStatus.BAD_REQUEST, "WEAK_PASSWORD", policyErrors.join(" "));
    }

    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
      throw authError(
        HttpStatus.CONFLICT,
        "EMAIL_ALREADY_REGISTERED",
        "An account with this email already exists.",
      );
    }

    if (await this.passwordService.isKnownBreached(dto.password)) {
      throw authError(
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
      throw authError(
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
      throw authError(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid email or password.");
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
      throw authError(HttpStatus.FORBIDDEN, "NO_WORKSPACE", "This account has no workspace.");
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

  async refresh(presentedRefreshToken: string, ctx: RequestContext): Promise<{ accessToken: string; refreshToken: string }> {
    const { userId, refreshToken } = await this.sessionService.rotate(presentedRefreshToken, ctx);

    const prisma = getPrismaClient();
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId },
      orderBy: { joinedAt: "asc" },
      include: { workspace: true },
    });

    if (!membership) {
      throw authError(HttpStatus.FORBIDDEN, "NO_WORKSPACE", "This account has no workspace.");
    }

    const accessToken = this.sessionService.signAccessToken({
      userId,
      workspaceId: membership.workspaceId,
      orgId: membership.workspace.organizationId,
      role: membership.role,
    });

    return { accessToken, refreshToken };
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
