import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { httpError } from "../common/http-error";
import { ROLES_KEY } from "./roles.decorator";

/**
 * RBAC authorization guard - the "Role model foundation" Phase 2 item.
 * Reads the role embedded in the (already-verified, by JwtAuthGuard)
 * access token, per API.md Section 7.2: "Role-based at the Workspace
 * level, checked on every mutating request." No endpoint uses `@Roles()`
 * yet - Phase 2 has no role-gated resources, only the auth surface
 * itself - but the guard is implemented and ready for Phase 3's first
 * real protected resource, per docs/reviews/phase-2-review.md.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const role = request.user?.role;

    if (!role || !requiredRoles.includes(role)) {
      throw httpError(
        HttpStatus.FORBIDDEN,
        "INSUFFICIENT_ROLE",
        `This action requires one of the following roles: ${requiredRoles.join(", ")}.`,
      );
    }

    return true;
  }
}
