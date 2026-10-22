import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { buildRequestContext } from "../common/request-context";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { setRefreshCookie } from "../auth/refresh-cookie";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AcceptInviteDto } from "./dto/accept-invite.dto";
import { ChangeMemberRoleDto } from "./dto/change-member-role.dto";
import { InviteMemberDto } from "./dto/invite-member.dto";
import { TransferOwnershipDto } from "./dto/transfer-ownership.dto";
import { WorkspaceMembershipService } from "./workspace-membership.service";

/**
 * Phase 16.1 (docs/architecture/personal-business-split.md Section 4) -
 * `@Roles()`/`RolesGuard` applied for the first time anywhere in this
 * codebase (roles.guard.ts's own doc comment: "No endpoint uses `@Roles()`
 * yet"). Safe to rely on now specifically because of the preceding
 * security fix: `JwtAuthGuard` re-reads the live `WorkspaceMember` role on
 * every request (commit 6776d32), so `RolesGuard` is checking current DB
 * state, never a stale token claim.
 *
 * All routes implicitly scope to `claims.workspaceId`, same as every
 * other authenticated endpoint - no `:workspaceId` path parameter exists
 * anywhere here, matching workspaces.controller.ts's own DELETE.
 */
@Controller("workspace")
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkspaceMembershipController {
  constructor(private readonly membership: WorkspaceMembershipService) {}

  @Get("members")
  async listMembers(@CurrentUser() claims: JwtPayload) {
    return { members: await this.membership.listMembers(claims.workspaceId) };
  }

  @Post("invites")
  @Roles("owner", "admin")
  async invite(@Body() dto: InviteMemberDto, @CurrentUser() claims: JwtPayload) {
    const result = await this.membership.invite(claims.workspaceId, claims.sub, { email: dto.email, role: dto.role });
    return { code: result.code, expiresAt: result.expiresAt };
  }

  @Post("invites/accept")
  @HttpCode(HttpStatus.OK)
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @CurrentUser() claims: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.membership.acceptInvite(dto.code, claims.sub, buildRequestContext(req));
    setRefreshCookie(res, result.refreshToken);
    return { workspaceId: result.workspaceId, role: result.role, accessToken: result.accessToken };
  }

  @Post("members/:id/role")
  @Roles("owner", "admin")
  async changeMemberRole(@Param("id") id: string, @Body() dto: ChangeMemberRoleDto, @CurrentUser() claims: JwtPayload) {
    return this.membership.changeMemberRole(claims.workspaceId, claims.sub, claims.role as "owner" | "admin" | "member", id, dto.role);
  }

  @Delete("members/:id")
  @Roles("owner", "admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(@Param("id") id: string, @CurrentUser() claims: JwtPayload): Promise<void> {
    await this.membership.removeMember(claims.workspaceId, claims.sub, claims.role as "owner" | "admin" | "member", id);
  }

  @Post("leave")
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(@CurrentUser() claims: JwtPayload): Promise<void> {
    await this.membership.leave(claims.workspaceId, claims.sub);
  }

  @Post("transfer-ownership")
  @Roles("owner")
  @HttpCode(HttpStatus.NO_CONTENT)
  async transferOwnership(@Body() dto: TransferOwnershipDto, @CurrentUser() claims: JwtPayload): Promise<void> {
    await this.membership.transferOwnership(claims.workspaceId, claims.sub, dto.userId);
  }
}
