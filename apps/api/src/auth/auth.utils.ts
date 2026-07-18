import { randomBytes } from "node:crypto";
import type { User } from "@smc/database";

export function normalizeEmail(email: string): string {
  // DATABASE.md Section 6.3 suggests Postgres `citext` for case-insensitive
  // email lookup - simplified here to application-layer normalization
  // instead of provisioning the citext extension, recorded as a deliberate
  // simplification in docs/reviews/phase-2-review.md.
  return email.trim().toLowerCase();
}

export function makeSlug(base: string): string {
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  const suffix = randomBytes(3).toString("hex");
  return `${cleaned || "workspace"}-${suffix}`;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

/**
 * The only function allowed to shape a User for an API response - never
 * includes auth secrets, per API.md Section 10.2's stated guarantee
 * ("DATABASE.md's user_credentials split is mirrored at the API layer by
 * simply never including those fields in any User representation, ever").
 */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}
