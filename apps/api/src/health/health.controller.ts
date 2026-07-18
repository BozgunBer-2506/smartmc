import { Controller, Get } from "@nestjs/common";
import { Redis } from "ioredis";
import { getPrismaClient } from "@smc/database";

type CheckStatus = "ok" | "error";

@Controller("health")
export class HealthController {
  @Get()
  async check(): Promise<{
    status: "ok" | "degraded";
    checks: Record<string, CheckStatus>;
    timestamp: string;
  }> {
    const checks: Record<string, CheckStatus> = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
    };

    const healthy = Object.values(checks).every((status) => status === "ok");

    return {
      status: healthy ? "ok" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<CheckStatus> {
    try {
      await getPrismaClient().$queryRaw`SELECT 1`;
      return "ok";
    } catch {
      return "error";
    }
  }

  private async checkRedis(): Promise<CheckStatus> {
    const redis = new Redis({
      host: process.env.REDIS_HOST ?? "localhost",
      port: Number(process.env.REDIS_PORT ?? 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    try {
      await redis.connect();
      await redis.ping();
      return "ok";
    } catch {
      return "error";
    } finally {
      redis.disconnect();
    }
  }
}
