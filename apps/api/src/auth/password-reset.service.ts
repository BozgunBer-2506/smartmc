import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { getPrismaClient, newId } from "@smc/database";
import { AuditLogService } from "../audit/audit-log.service";
import { authConfig } from "../config/auth.config";
import { httpError } from "../common/http-error";
import { TRANSACTIONAL_EMAIL_SERVICE, type TransactionalEmailService } from "../transactional-email/transactional-email.service";
import { normalizeEmail } from "./auth.utils";
import { DevPasswordResetFaultInjectorService } from "./dev-password-reset-fault-injector.service";
import { LoginThrottleService } from "./login-throttle.service";
import { PasswordService } from "./password.service";
import type { RequestContext } from "./session.service";
import { SessionService } from "./session.service";

/**
 * Forgot/reset-password business logic (Auth Reliability Hardening) -
 * mirrors AuthService's shape (owns "who is allowed to reset and why",
 * delegates token/hash mechanics to small focused helpers) rather than
 * growing AuthService itself. Reuses PasswordService's exact policy/breach
 * check (no drift from registration), SessionService.revokeAllForUser
 * (no new revocation logic), and LoginThrottleService's Redis pattern
 * extended with a separate reset-specific counter.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly loginThrottle: LoginThrottleService,
    private readonly auditLog: AuditLogService,
    private readonly faultInjector: DevPasswordResetFaultInjectorService,
    @Inject(TRANSACTIONAL_EMAIL_SERVICE) private readonly transactionalEmail: TransactionalEmailService,
  ) {}

  private hashToken(token: string): string {
    // Same method as SessionService.hashRefreshToken - a high-entropy
    // random value, not a password, so SHA-256 (not Argon2id) is correct here.
    return createHash("sha256").update(token).digest("hex");
  }

  private generateToken(): string {
    return randomBytes(32).toString("base64url");
  }

  /**
   * Always returns the same externally-visible outcome regardless of
   * whether `email` has an account - the only difference is server-side
   * (whether a token/email actually gets created). Rate-limited: when
   * throttled, returns the identical generic response without doing any
   * further work, so being throttled is itself not an observable signal.
   */
  async requestReset(email: string, ctx: RequestContext): Promise<void> {
    const normalized = normalizeEmail(email);

    if (await this.loginThrottle.isResetLocked(normalized, ctx.ipAddress)) {
      return;
    }
    await this.loginThrottle.recordResetRequest(normalized, ctx.ipAddress);

    const prisma = getPrismaClient();
    const user = await prisma.user.findFirst({ where: { email: normalized } });

    if (!user) {
      // Equivalent-shape dummy work so a non-existent email doesn't
      // resolve measurably faster than a real one - best-effort timing
      // parity, not a cryptographic guarantee (matches this codebase's
      // existing "disclosed, not paranoid-grade" posture, e.g.
      // PasswordService.isKnownBreached's own fail-open comment).
      this.hashToken(this.generateToken());
      return;
    }

    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + authConfig.passwordResetTokenTtlMinutes * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { id: newId(), userId: user.id, tokenHash: this.hashToken(token), expiresAt },
    });

    const resetUrl = `${authConfig.webAppBaseUrl()}/reset-password?token=${token}`;

    // A failed/unconfigured send (see UnconfiguredTransactionalEmailService,
    // bound in production until a real provider exists) must never change
    // this method's external contract - the caller still gets the same
    // generic response either way, so this can never become an
    // account-existence oracle. The failure is recorded server-side only.
    try {
      await this.transactionalEmail.sendPasswordReset(normalized, resetUrl);
      await this.auditLog.log({
        actorUserId: user.id,
        actorType: "user",
        action: "user.password_reset_requested",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: ctx.ipAddress,
      });
    } catch {
      await this.auditLog.log({
        actorUserId: user.id,
        actorType: "user",
        action: "user.password_reset_email_not_sent",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: ctx.ipAddress,
      });
    }
  }

  /**
   * Validates the token, applies the exact same password policy as
   * registration, then replaces the hash, invalidates the token, and
   * revokes every existing session for the account - all three inside
   * one Prisma interactive transaction. This is deliberate, not
   * incidental: without it, a crash/connection-drop between the token
   * claim and the password write would leave the token permanently
   * unusable while the password stayed unchanged (a real, previously-
   * unverified failure mode, closed here) - and the reverse (password
   * changed but token still claimable, or sessions left active after a
   * reset) is exactly what "reset implies the account may have been
   * compromised" (SECURITY.md's session-rotation reasoning) must not
   * allow. The token-claim's own conditional `updateMany` inside the
   * transaction is what actually makes concurrent use of the same token
   * safe (a second, truly simultaneous request loses the row-lock race
   * and reads `count: 0`, not a timing artifact of this being a test).
   */
  async resetPassword(presentedToken: string, newPassword: string, ctx: RequestContext): Promise<void> {
    const prisma = getPrismaClient();
    const tokenHash = this.hashToken(presentedToken);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    // Same generic error for "doesn't exist" / "already used" / "expired" -
    // never distinguish these to the caller (requirement: safe generic error).
    const invalid = () => httpError(HttpStatus.BAD_REQUEST, "RESET_TOKEN_INVALID", "This password reset link is invalid or has expired.");

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw invalid();
    }

    const policyErrors = this.passwordService.validatePolicy(newPassword);
    if (policyErrors.length > 0) {
      throw httpError(HttpStatus.BAD_REQUEST, "WEAK_PASSWORD", policyErrors.join(" "));
    }
    if (await this.passwordService.isKnownBreached(newPassword)) {
      throw httpError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "PASSWORD_BREACHED",
        "This password has appeared in a known data breach. Please choose a different one.",
      );
    }

    const passwordHash = await this.passwordService.hash(newPassword);

    let revokedCount = 0;
    await prisma.$transaction(async (tx) => {
      // Atomic, race-safe single-use: only succeeds if usedAt was still
      // null at write time - a concurrent second submission of the same
      // token loses this race and gets treated as invalid, not a
      // double-reset. This is the real DB-level mutual exclusion (a row
      // lock during the UPDATE, not test timing).
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw invalid();
      }

      // Dev/test-only seam (never reachable in production - see
      // DevPasswordResetFaultInjectorController's own guard) - lets an
      // automated test force a failure after a real DB mutation has
      // already happened inside this transaction, to prove the whole
      // thing rolls back rather than merely asserting it by inspection.
      if (this.faultInjector.consumeIfArmed()) {
        throw new Error("Forced test failure (DevPasswordResetFaultInjectorService) - the enclosing transaction must roll back.");
      }

      await tx.userCredentials.upsert({
        where: { userId: record.userId },
        update: { passwordHash },
        create: { id: newId(), userId: record.userId, passwordHash },
      });

      revokedCount = await this.sessionService.revokeAllForUser(record.userId, tx);
    });

    // Deliberately outside the transaction, matching AuthService.register's
    // own convention - an audit-log failure must never roll back a
    // legitimate, already-committed password reset.
    await this.auditLog.log({
      actorUserId: record.userId,
      actorType: "user",
      action: "user.password_reset_completed",
      resourceType: "user",
      resourceId: record.userId,
      ipAddress: ctx.ipAddress,
      metadata: { sessionsRevoked: revokedCount },
    });
  }
}
