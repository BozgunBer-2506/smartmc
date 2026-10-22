import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { buildRequestContext } from "../common/request-context";
import { authConfig } from "../config/auth.config";
import { AuthService } from "./auth.service";
import { httpError } from "../common/http-error";
import { CurrentUser } from "./current-user.decorator";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { JwtPayload } from "./jwt-payload";
import { PasswordResetService } from "./password-reset.service";
import { clearRefreshCookie, setRefreshCookie } from "./refresh-cookie";
import { HttpStatus } from "@nestjs/common";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto, buildRequestContext(req));
    setRefreshCookie(res, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, buildRequestContext(req));
    setRefreshCookie(res, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = req.cookies?.[authConfig.refreshCookieName];
    if (!presented) {
      throw httpError(HttpStatus.UNAUTHORIZED, "REFRESH_TOKEN_MISSING", "No refresh token cookie present.");
    }

    const result = await this.authService.refresh(presented, buildRequestContext(req));
    setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = req.cookies?.[authConfig.refreshCookieName];
    if (presented) {
      await this.authService.logout(presented, buildRequestContext(req));
    }
    clearRefreshCookie(res);
    return { status: "ok" };
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logoutAll(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.sub, buildRequestContext(req));
    clearRefreshCookie(res);
    return { status: "ok" };
  }

  @Get("sessions")
  @UseGuards(JwtAuthGuard)
  async listSessions(@CurrentUser() user: JwtPayload) {
    const sessions = await this.authService.listSessions(user.sub);
    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }));
  }

  /**
   * Always 200 with the same body, whether or not the email has an
   * account - enumeration-safety lives in PasswordResetService itself,
   * this handler just never branches on the result.
   */
  @Post("forgot-password")
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.passwordResetService.requestReset(dto.email, buildRequestContext(req));
    return { message: "If an account exists for this email, password reset instructions have been sent." };
  }

  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    await this.passwordResetService.resetPassword(dto.token, dto.newPassword, buildRequestContext(req));
    return { status: "ok" };
  }

}
