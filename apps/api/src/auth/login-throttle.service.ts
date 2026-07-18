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
    await this.incrementWithWindow(this.key("email", email));
    if (ipAddress) {
      await this.incrementWithWindow(this.key("ip", ipAddress));
    }
  }

  async reset(email: string, ipAddress: string | null | undefined): Promise<void> {
    await this.redis.del(this.key("email", email));
    if (ipAddress) {
      await this.redis.del(this.key("ip", ipAddress));
    }
  }

  private async incrementWithWindow(key: string): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, authConfig.loginLockoutWindowSeconds);
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
