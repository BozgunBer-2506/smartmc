import { HttpStatus, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import { getPrismaClient, newId, type ExtendedTransactionClient, type Session } from "@smc/database";
import { authConfig } from "../config/auth.config";
import { AuditLogService } from "../audit/audit-log.service";
import { httpError } from "../common/http-error";

export interface SessionClaims {
  userId: string;
  workspaceId: string;
  orgId: string;
  role: string;
}

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  session: Session;
}

/**
 * Owns refresh-token/session mechanics only (issue/rotate/revoke) - not
 * the business logic of *who* is allowed to have a session (that's
 * AuthService). Implements docs/DATABASE.md Section 6.20's `family_id`
 * rotation + reuse-detection design and ARCHITECTURE.md Section 6's
 * token shape, per ADR-0014.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Refresh tokens are high-entropy random values, not passwords - hashed
   * with SHA-256 (fast, appropriate for verifying a 256-bit random secret)
   * rather than Argon2id (which is for low-entropy human-chosen secrets,
   * used for passwords in password.service.ts). Conflating the two would
   * make refresh-token verification needlessly slow for no security benefit.
   */
  private hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private generateRefreshToken(): string {
    return randomBytes(32).toString("base64url");
  }

  signAccessToken(claims: SessionClaims): string {
    return this.jwtService.sign(
      {
        sub: claims.userId,
        workspaceId: claims.workspaceId,
        orgId: claims.orgId,
        role: claims.role,
        scopes: ["*"], // API.md Section 7.1: first-party clients use the documented "all scopes" shortcut
      },
      { secret: authConfig.jwtSecret, expiresIn: authConfig.accessTokenTtlSeconds },
    );
  }

  /**
   * Starts a brand-new rotation family - used for fresh login/registration,
   * and (Phase 16.1 security-audit fix) for creating/joining a workspace.
   * `claims.workspaceId` is persisted onto the session (not just the
   * access token) specifically so a later `rotate()` knows which
   * workspace this refresh-token family represents, instead of
   * `AuthService.refresh()` having to guess.
   */
  async issue(claims: SessionClaims, ctx: RequestContext): Promise<IssuedSession> {
    const prisma = getPrismaClient();
    const refreshToken = this.generateRefreshToken();
    const expiresAt = new Date(Date.now() + authConfig.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    const session = await prisma.session.create({
      data: {
        id: newId(),
        userId: claims.userId,
        workspaceId: claims.workspaceId,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        familyId: newId(),
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ipAddress ?? null,
        expiresAt,
      },
    });

    return { accessToken: this.signAccessToken(claims), refreshToken, session };
  }

  /**
   * Validates and rotates a presented refresh token. Returns the userId
   * and the new session/token; the caller (AuthService) is responsible
   * for re-resolving the CURRENT role in the resulting `session.workspaceId`
   * and signing a fresh access token via `signAccessToken`. The workspace
   * is never re-derived here or GUESSED by the caller (Phase 16.1
   * security-audit fix) - by default it's carried forward unchanged from
   * the session being rotated, onto the new row in the same family, so a
   * plain refresh can never silently move a session to a different
   * workspace than the one it was issued for.
   *
   * `overrideWorkspaceId` (Phase 16.1 frontend-integration step) is the
   * ONE deliberate exception: workspace switching. It still goes through
   * this exact same rotation - same reuse-detection, same family, same
   * revoke-the-old-row-first mechanics - the only difference is which
   * workspaceId the new row in the family carries forward. This method
   * never checks whether the caller is actually allowed into that
   * workspace - that authorization is AuthService.switchWorkspace()'s
   * job (session mechanics vs. "who's allowed," this class's own stated
   * boundary), checked and resolved BEFORE this is ever called.
   *
   * `expectedUserId` (frontend-integration follow-up fix): switchWorkspace()
   * is the one caller that already knows an independently-verified
   * identity (the access token's `claims.sub`, via JwtAuthGuard) before
   * it ever touches the refresh cookie. A refresh token's owning user can
   * only be learned by looking up the session row itself - so the
   * ownership check MUST happen here, before any mutation, not as a
   * post-hoc comparison after this method has already revoked a session
   * and created a new one. The original version checked
   * `sessionUserId !== userId` only after calling `rotate()` - by then,
   * a refresh token belonging to a DIFFERENT user than the caller had
   * already been rotated (their old token revoked, a new session row
   * created under THEIR userId but with the caller's chosen
   * `overrideWorkspaceId`) before the mismatch was ever detected and the
   * request failed. Checked here, first, a mismatched token is rejected
   * with zero side effect - the other user's session is never touched.
   */
  async rotate(
    presentedRefreshToken: string,
    ctx: RequestContext,
    overrideWorkspaceId?: string,
    expectedUserId?: string,
  ): Promise<{ userId: string; refreshToken: string; session: Session }> {
    const prisma = getPrismaClient();
    const presentedHash = this.hashRefreshToken(presentedRefreshToken);
    const existing = await prisma.session.findFirst({ where: { refreshTokenHash: presentedHash } });

    if (!existing) {
      throw httpError(HttpStatus.UNAUTHORIZED, "REFRESH_TOKEN_INVALID", "Refresh token is invalid.");
    }

    if (expectedUserId && existing.userId !== expectedUserId) {
      // Reject before any mutation - never revoke, rotate, or otherwise
      // touch a session that doesn't belong to the identity the caller
      // already proved via their access token.
      throw httpError(HttpStatus.UNAUTHORIZED, "SESSION_MISMATCH", "This session does not belong to the authenticated user.");
    }

    if (existing.revokedAt) {
      // Reuse of an already-rotated (or already-revoked) token is a strong
      // signal of theft - revoke the whole family immediately, not just
      // this one token (DATABASE.md Section 6.20, SECURITY.md Section 4.3).
      await prisma.session.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.auditLog.log({
        actorUserId: existing.userId,
        actorType: "user",
        action: "session.reuse_detected",
        resourceType: "session",
        resourceId: existing.id,
        ipAddress: ctx.ipAddress,
        metadata: { familyId: existing.familyId },
      });
      throw httpError(
        HttpStatus.UNAUTHORIZED,
        "REFRESH_TOKEN_REUSE_DETECTED",
        "This refresh token has already been used. All sessions for this account have been revoked as a precaution.",
      );
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw httpError(HttpStatus.UNAUTHORIZED, "REFRESH_TOKEN_EXPIRED", "Refresh token has expired.");
    }

    // Rotate: revoke the presented session but keep its row (its hash is
    // exactly what makes a future reuse-of-this-token detectable above),
    // then issue a new session in the same family.
    await prisma.session.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });

    const refreshToken = this.generateRefreshToken();
    const expiresAt = new Date(Date.now() + authConfig.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
    const newSession = await prisma.session.create({
      data: {
        id: newId(),
        userId: existing.userId,
        workspaceId: overrideWorkspaceId ?? existing.workspaceId,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        familyId: existing.familyId,
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ipAddress ?? null,
        expiresAt,
      },
    });

    await this.auditLog.log({
      actorUserId: existing.userId,
      actorType: "user",
      action: overrideWorkspaceId && overrideWorkspaceId !== existing.workspaceId ? "session.workspace_switched" : "session.refreshed",
      resourceType: "session",
      resourceId: newSession.id,
      ipAddress: ctx.ipAddress,
      metadata: overrideWorkspaceId && overrideWorkspaceId !== existing.workspaceId ? { fromWorkspaceId: existing.workspaceId, toWorkspaceId: overrideWorkspaceId } : undefined,
    });

    return { userId: existing.userId, refreshToken, session: newSession };
  }

  /** Revokes exactly the session matching the presented token - used for logout. */
  async revoke(presentedRefreshToken: string): Promise<{ userId: string } | null> {
    const prisma = getPrismaClient();
    const hash = this.hashRefreshToken(presentedRefreshToken);
    const existing = await prisma.session.findFirst({ where: { refreshTokenHash: hash, revokedAt: null } });
    if (!existing) return null;

    await prisma.session.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    return { userId: existing.userId };
  }

  /**
   * Revokes every active session for a user - "log out everywhere"
   * (SECURITY.md Section 4.3). Accepts an optional transaction client
   * (`tx`) so a caller needing this to participate in a larger atomic
   * operation - PasswordResetService's reset, which must not leave a
   * consumed token paired with an unchanged password, or a changed
   * password paired with sessions still active - can pass one in instead
   * of this running against its own separate connection. Defaults to the
   * shared singleton for every existing caller (logout-all), unchanged.
   */
  async revokeAllForUser(userId: string, tx?: ExtendedTransactionClient): Promise<number> {
    const client = tx ?? getPrismaClient();
    const result = await client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Active sessions for the session-visibility surface (SECURITY.md
   * Section 4.3) - a single user's own active devices, naturally bounded
   * to a small number in practice. Not given full cursor pagination
   * (ROADMAP.md Phase 20.2) since building a paged UI for "your own
   * device list" is disproportionate to the risk; a flat safety cap
   * instead closes the genuinely-unbounded-query gap a pathological
   * session-creation bug could otherwise hit.
   */
  async listActiveForUser(userId: string): Promise<Session[]> {
    const prisma = getPrismaClient();
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
}
