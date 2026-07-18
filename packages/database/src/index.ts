import { PrismaClient } from "@prisma/client";
import { withSoftDeletes } from "./soft-delete";

export * from "@prisma/client";
export { newId } from "./ids";

function createExtendedClient() {
  return withSoftDeletes(new PrismaClient());
}

type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

let prismaSingleton: ExtendedPrismaClient | undefined;

/**
 * A shared, soft-delete-enforcing PrismaClient instance per process
 * (docs/DATABASE.md Section 20) - avoids exhausting Postgres connections
 * in dev's hot-reload cycles, and ensures every consumer (apps/api,
 * packages/identity) gets the extended client, never a raw PrismaClient
 * that could accidentally bypass soft-delete filtering.
 */
export function getPrismaClient(): ExtendedPrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = createExtendedClient();
  }
  return prismaSingleton;
}
