import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { getPrismaClient } from "@smc/database";
import type { Request } from "express";
import { httpError } from "../common/http-error";
import type { JwtPayload } from "./jwt-payload";
import { TokenService } from "./token.service";

declare module "express" {
  interface Request {
    user?: JwtPayload;
  }
}

/**
 * Authentication guard (docs/ROADMAP.md Phase 2 "Authentication
 * middleware" / "Protected API routes"). Deliberately hand-rolled rather
 * than Passport+passport-jwt (ADR-0014) - a Bearer-token check against
 * `@nestjs/jwt` is a handful of lines and Passport's strategy abstraction
 * buys nothing extra for a single, first-party JWT scheme.
 *
 * Phase 2B addition: a signature-valid, unexpired access token is no
 * longer sufficient on its own - `claims.sub` must still resolve to a
 * real User row. Without this, a still-valid token (up to
 * accessTokenTtlSeconds, 15 min) issued before DELETE /v1/users/me
 * would keep authorizing every one of this guard's ~20 other call sites
 * even after the account - and, for a sole-owned workspace, all its data
 * - no longer exists; workspace-deletion.service.ts's own equivalent
 * residual-token window was accepted there because the data itself was
 * gone (reads return empty, writes hit a dead FK), but account deletion
 * needs this closed centrally, once, here - every protected endpoint
 * already goes through this one guard, so this is the smallest change
 * that covers all of them without adding a new service or a Redis
 * deny-list.
 *
 * Phase 16.1 pre-work addition: the user-exists check above is replaced
 * by a `WorkspaceMember` check against `(claims.workspaceId, claims.sub)` -
 * a strict superset of the same protection (`WorkspaceMember.userId` is a
 * required RESTRICT foreign key to `User`, so a deleted account has no
 * membership row either, same reasoning RealtimeGateway's own equivalent
 * check already documents) that additionally closes the gap a plain
 * user-exists check left open: a member removed from this specific
 * workspace (not yet possible today, becomes possible once Phase 16.1
 * ships membership removal) kept full REST access for the rest of their
 * token's 15-minute life, since nothing re-checked membership on each
 * request. Fail-closed: no membership row (account deleted OR removed
 * from this workspace) rejects the request, same as before.
 *
 * The membership row's *current* `role` - never the token's own `role`
 * claim, which is only as fresh as the moment the token was issued - is
 * attached onto `request.user` here, so `RolesGuard` (reading
 * `request.user?.role`) authorizes against live DB state without needing
 * any change of its own; the guard ordering (`JwtAuthGuard` always runs
 * before `RolesGuard`) is what makes this work. Deliberately NOT applied
 * to RealtimeModule's gateway, which authenticates via TokenService
 * directly, not this guard - unchanged, out of this phase's scope.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.tokenService.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw httpError(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Missing bearer token.");
    }

    let claims: JwtPayload;
    try {
      claims = await this.tokenService.verify(token);
    } catch {
      throw httpError(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Invalid or expired access token.");
    }

    const prisma = getPrismaClient();
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: claims.workspaceId, userId: claims.sub },
      select: { role: true },
    });
    if (!membership) {
      throw httpError(
        HttpStatus.UNAUTHORIZED,
        "UNAUTHENTICATED",
        "This account no longer has access to this workspace.",
      );
    }

    request.user = { ...claims, role: membership.role };
    return true;
  }
}
