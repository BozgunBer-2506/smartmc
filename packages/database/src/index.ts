import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";
export { newId } from "./ids";

let prismaSingleton: PrismaClient | undefined;

/** A shared PrismaClient instance per process - avoids exhausting Postgres connections in dev's hot-reload cycles. */
export function getPrismaClient(): PrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient();
  }
  return prismaSingleton;
}
