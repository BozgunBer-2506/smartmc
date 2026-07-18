import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuditLogModule } from "../audit/audit-log.module";
import { authConfig } from "../config/auth.config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { LoginThrottleService } from "./login-throttle.service";
import { PasswordService } from "./password.service";
import { RolesGuard } from "./roles.guard";
import { SessionService } from "./session.service";
import { TokenService } from "./token.service";

@Module({
  imports: [
    AuditLogModule,
    JwtModule.register({
      secret: authConfig.jwtSecret,
      signOptions: { expiresIn: authConfig.accessTokenTtlSeconds },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    PasswordService,
    LoginThrottleService,
    TokenService,
    JwtAuthGuard,
    RolesGuard,
  ],
  // TokenService (verification) and JwtModule (signing, via SessionService)
  // are both exported so any module needing to authenticate a token -
  // RealtimeModule's gateway, MockConnectorModule's optional-auth path -
  // can do so identically, without re-deriving the secret/config itself.
  exports: [JwtAuthGuard, RolesGuard, JwtModule, TokenService],
})
export class AuthModule {}
