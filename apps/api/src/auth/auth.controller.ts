import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { authConfig } from "../config/auth.config";
import { AuthService } from "./auth.service";
import { httpError } from "../common/http-error";
import { CurrentUser } from "./current-user.decorator";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { JwtPayload } from "./jwt-payload";
import type { RequestContext } from "./session.service";
import { HttpStatus } from "@nestjs/common";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto, this.buildContext(req));
    this.setRefreshCookie(res, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, this.buildContext(req));
    this.setRefreshCookie(res, result.refreshToken);
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = req.cookies?.[authConfig.refreshCookieName];
    if (!presented) {
      throw httpError(HttpStatus.UNAUTHORIZED, "REFRESH_TOKEN_MISSING", "No refresh token cookie present.");
    }

    const result = await this.authService.refresh(presented, this.buildContext(req));
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = req.cookies?.[authConfig.refreshCookieName];
    if (presented) {
      await this.authService.logout(presented, this.buildContext(req));
    }
    this.clearRefreshCookie(res);
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
    await this.authService.logoutAll(user.sub, this.buildContext(req));
    this.clearRefreshCookie(res);
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

  private buildContext(req: Request): RequestContext {
    return {
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    };
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(authConfig.refreshCookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: authConfig.refreshCookiePath,
      maxAge: authConfig.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(authConfig.refreshCookieName, { path: authConfig.refreshCookiePath });
  }
}
