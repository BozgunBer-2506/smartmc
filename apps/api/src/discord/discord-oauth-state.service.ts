import { randomBytes } from "node:crypto";
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

const STATE_TTL_SECONDS = 10 * 60;

/**
 * Short-lived CSRF state for Discord's OAuth2 install flow - the browser
 * leaves our app entirely (redirected to Discord and back), so the
 * workspace a "connect" request belongs to has to survive that round trip
 * some way other than an in-memory variable. Reuses this codebase's
 * existing Redis instance pattern (auth/login-throttle.service.ts) rather
 * than introducing new infrastructure for one small lookup. A known,
 * disclosed scale limitation: this is a single Redis instance, fine for
 * this project's current stage, not a multi-region-ready state store.
 */
@Injectable()
export class DiscordOAuthStateService implements OnModuleDestroy {
  private readonly redis = new Redis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
  });

  private key(state: string): string {
    return `discord_oauth_state:${state}`;
  }

  async create(workspaceId: string): Promise<string> {
    const state = randomBytes(24).toString("hex");
    await this.redis.set(this.key(state), workspaceId, "EX", STATE_TTL_SECONDS);
    return state;
  }

  /** Consumes the state - a state token is usable exactly once, deleted immediately whether or not it resolves. */
  async consume(state: string): Promise<string | null> {
    const workspaceId = await this.redis.get(this.key(state));
    await this.redis.del(this.key(state));
    return workspaceId;
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
