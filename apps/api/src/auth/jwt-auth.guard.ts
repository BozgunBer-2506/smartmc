import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { authConfig } from "../config/auth.config";
import { authError } from "./auth.exceptions";
import type { JwtPayload } from "./jwt-payload";

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
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw authError(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Missing bearer token.");
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: authConfig.jwtSecret,
      });
      request.user = payload;
      return true;
    } catch {
      throw authError(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Invalid or expired access token.");
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return undefined;
    return header.slice("Bearer ".length).trim();
  }
}
