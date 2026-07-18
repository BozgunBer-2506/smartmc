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
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
