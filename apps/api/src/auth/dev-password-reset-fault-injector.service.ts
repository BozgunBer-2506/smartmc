import { Injectable } from "@nestjs/common";

/**
 * Dev/test-only seam for verifying PasswordResetService.resetPassword's
 * transaction boundary actually rolls back. `armFailureAfterTokenClaim`
 * (via the dev-only controller below) makes the very next reset attempt
 * throw immediately after its token-claim mutation but before the
 * password/session mutations - a real automated test can then confirm
 * the whole transaction rolled back (token still unused, password
 * unchanged) rather than merely asserting it by inspection. Auto-disarms
 * after one use so it can never affect a later, unrelated request.
 * Same shape as `InMemoryTransactionalEmailService` - in-memory,
 * production-unreachable (its controller 404s in production).
 */
@Injectable()
export class DevPasswordResetFaultInjectorService {
  private armed = false;

  arm(): void {
    this.armed = true;
  }

  /** Returns true (and disarms) exactly once per arm() call. */
  consumeIfArmed(): boolean {
    if (!this.armed) return false;
    this.armed = false;
    return true;
  }
}
