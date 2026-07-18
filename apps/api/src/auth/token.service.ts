import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { authConfig } from "../config/auth.config";
import type { JwtPayload } from "./jwt-payload";

/**
 * Centralizes access-token verification (secret, algorithm) so every
 * consumer - JwtAuthGuard (HTTP), RealtimeGateway (WebSocket), the mock
 * connector's optional-auth path - verifies identically, rather than each
 * repeating `jwtService.verifyAsync(token, { secret: authConfig.jwtSecret })`.
 * Signing stays on SessionService (auth.service.ts owns "who gets a
 * session"; this owns "is this token valid," used wherever a token shows
 * up regardless of transport).
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  async verify(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token, { secret: authConfig.jwtSecret });
  }

  extractBearerToken(authorizationHeader: string | undefined): string | undefined {
    if (!authorizationHeader?.startsWith("Bearer ")) return undefined;
    return authorizationHeader.slice("Bearer ".length).trim();
  }
}
