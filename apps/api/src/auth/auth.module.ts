import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuditLogModule } from "../audit/audit-log.module";
import { authConfig } from "../config/auth.config";
import { TransactionalEmailModule } from "../transactional-email/transactional-email.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { DevPasswordResetFaultInjectorController } from "./dev-password-reset-fault-injector.controller";
import { DevPasswordResetFaultInjectorService } from "./dev-password-reset-fault-injector.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { LoginThrottleService } from "./login-throttle.service";
import { PasswordResetService } from "./password-reset.service";
import { PasswordService } from "./password.service";
import { RolesGuard } from "./roles.guard";
import { SessionService } from "./session.service";
import { TokenService } from "./token.service";

@Module({
  imports: [
    AuditLogModule,
    TransactionalEmailModule,
    JwtModule.register({
      secret: authConfig.jwtSecret,
      signOptions: { expiresIn: authConfig.accessTokenTtlSeconds },
    }),
  ],
  controllers: [AuthController, DevPasswordResetFaultInjectorController],
  providers: [
    AuthService,
    SessionService,
    PasswordService,
    PasswordResetService,
    DevPasswordResetFaultInjectorService,
    LoginThrottleService,
    TokenService,
    JwtAuthGuard,
    RolesGuard,
  ],
  // TokenService (verification) and JwtModule (signing, via SessionService)
  // are both exported so any module needing to authenticate a token -
  // RealtimeModule's gateway, MockConnectorModule's optional-auth path -
  // can do so identically, without re-deriving the secret/config itself.
  // SessionService is exported too - WorkspacesModule's WorkspaceMembershipService
  // needs it for leave/transfer-ownership session rotation.
  exports: [JwtAuthGuard, RolesGuard, JwtModule, TokenService, SessionService],
})
export class AuthModule {}
