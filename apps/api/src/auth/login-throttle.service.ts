import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { authConfig } from "../config/auth.config";

/**
 * Account lockout / progressive delay on repeated failed logins, keyed on
 * both account and source IP independently (SECURITY.md Section 4.1) -
 * resists credential stuffing (many accounts, one IP) and targeted brute
 * force (one account, many IPs) as two separate counters.
 */
@Injectable()
export class LoginThrottleService implements OnModuleDestroy {
  private readonly redis = new Redis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  });

  private key(kind: "email" | "ip", value: string): string {
    return `login_attempts:${kind}:${value}`;
  }

  async isLocked(email: string, ipAddress: string | null | undefined): Promise<boolean> {
    const emailCount = await this.redis.get(this.key("email", email));
    if (emailCount && Number(emailCount) >= authConfig.loginLockoutMaxAttempts) return true;

    if (ipAddress) {
      const ipCount = await this.redis.get(this.key("ip", ipAddress));
      if (ipCount && Number(ipCount) >= authConfig.loginLockoutMaxAttempts) return true;
    }

    return false;
  }

  async recordFailure(email: string, ipAddress: string | null | undefined): Promise<void> {
    await this.incrementWithWindow(this.key("email", email), authConfig.loginLockoutWindowSeconds);
    if (ipAddress) {
      await this.incrementWithWindow(this.key("ip", ipAddress), authConfig.loginLockoutWindowSeconds);
    }
  }

  async reset(email: string, ipAddress: string | null | undefined): Promise<void> {
    await this.redis.del(this.key("email", email));
    if (ipAddress) {
      await this.redis.del(this.key("ip", ipAddress));
    }
  }

  /**
   * Same counter shape as login lockout, separate Redis key namespace and
   * separate (longer) window/threshold - forgot-password abuse (spamming
   * one email with reset links, or hammering the endpoint from one IP) is
   * a distinct concern from login brute-forcing, not merged into the same
   * counters. Deliberately does not distinguish an existing-account email
   * from an unknown one - the enumeration-safety guarantee lives in
   * PasswordResetService's response shape, not here.
   */
  private resetKey(kind: "email" | "ip", value: string): string {
    return `password_reset_attempts:${kind}:${value}`;
  }

  async isResetLocked(email: string, ipAddress: string | null | undefined): Promise<boolean> {
    const emailCount = await this.redis.get(this.resetKey("email", email));
    if (emailCount && Number(emailCount) >= authConfig.passwordResetLockoutMaxAttempts) return true;

    if (ipAddress) {
      const ipCount = await this.redis.get(this.resetKey("ip", ipAddress));
      if (ipCount && Number(ipCount) >= authConfig.passwordResetLockoutMaxAttempts) return true;
    }

    return false;
  }

  async recordResetRequest(email: string, ipAddress: string | null | undefined): Promise<void> {
    await this.incrementWithWindow(this.resetKey("email", email), authConfig.passwordResetLockoutWindowSeconds);
    if (ipAddress) {
      await this.incrementWithWindow(this.resetKey("ip", ipAddress), authConfig.passwordResetLockoutWindowSeconds);
    }
  }

  private async incrementWithWindow(key: string, windowSeconds: number): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
