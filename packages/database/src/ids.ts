import { v7 as uuidv7 } from "uuid";

/** Generates a UUIDv7 primary key, per ADR-0007 - time-ordered, unlike Prisma's default @default(uuid()) which is v4. */
export function newId(): string {
  return uuidv7();
}
