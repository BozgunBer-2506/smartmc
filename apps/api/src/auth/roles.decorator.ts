import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

/**
 * Marks an endpoint as requiring one of the given workspace roles
 * (docs/DATABASE.md Section 6.3: owner/admin/member - ARCHITECTURE.md
 * Section 6 step 4's RBAC foundation). Must be paired with JwtAuthGuard
 * (authentication) and RolesGuard (authorization) - see auth.module.ts's
 * guard ordering.
 */
export const Roles = (...roles: Array<"owner" | "admin" | "member">) => SetMetadata(ROLES_KEY, roles);
