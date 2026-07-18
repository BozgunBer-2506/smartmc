import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
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

    try {
      request.user = await this.tokenService.verify(token);
      return true;
    } catch {
      throw httpError(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Invalid or expired access token.");
    }
  }
}
