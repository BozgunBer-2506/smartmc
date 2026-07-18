import { HttpStatus, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import { getPrismaClient, newId, type Session } from "@smc/database";
import { authConfig } from "../config/auth.config";
import { AuditLogService } from "../audit/audit-log.service";
import { authError } from "./auth.exceptions";

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

  /** Starts a brand-new rotation family - used for fresh login/registration. */
  async issue(claims: SessionClaims, ctx: RequestContext): Promise<IssuedSession> {
    const prisma = getPrismaClient();
    const refreshToken = this.generateRefreshToken();
    const expiresAt = new Date(Date.now() + authConfig.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    const session = await prisma.session.create({
      data: {
        id: newId(),
        userId: claims.userId,
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
   * and new session/token; the caller (AuthService) is responsible for
   * re-resolving claims (workspace/role) and signing a fresh access token
   * via `signAccessToken`, since a Session row only ever tracks `userId` -
   * which workspace context to embed is business logic, not session mechanics.
   */
  async rotate(
    presentedRefreshToken: string,
    ctx: RequestContext,
  ): Promise<{ userId: string; refreshToken: string; session: Session }> {
    const prisma = getPrismaClient();
    const presentedHash = this.hashRefreshToken(presentedRefreshToken);
    const existing = await prisma.session.findFirst({ where: { refreshTokenHash: presentedHash } });

    if (!existing) {
      throw authError(HttpStatus.UNAUTHORIZED, "REFRESH_TOKEN_INVALID", "Refresh token is invalid.");
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
      throw authError(
        HttpStatus.UNAUTHORIZED,
        "REFRESH_TOKEN_REUSE_DETECTED",
        "This refresh token has already been used. All sessions for this account have been revoked as a precaution.",
      );
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw authError(HttpStatus.UNAUTHORIZED, "REFRESH_TOKEN_EXPIRED", "Refresh token has expired.");
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
      action: "session.refreshed",
      resourceType: "session",
      resourceId: newSession.id,
      ipAddress: ctx.ipAddress,
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

  /** Revokes every active session for a user - "log out everywhere" (SECURITY.md Section 4.3). */
  async revokeAllForUser(userId: string): Promise<number> {
    const prisma = getPrismaClient();
    const result = await prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /** Active sessions for the session-visibility surface (SECURITY.md Section 4.3). */
  async listActiveForUser(userId: string): Promise<Session[]> {
    const prisma = getPrismaClient();
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  }
}
