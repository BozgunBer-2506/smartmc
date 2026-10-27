import { Body, Controller, Delete, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { buildRequestContext } from "../common/request-context";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { setRefreshCookie } from "../auth/refresh-cookie";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import { WorkspaceDeletionService } from "./workspace-deletion.service";
import { WorkspaceMembershipService } from "./workspace-membership.service";

/**
 * No `:id` path parameter on the existing DELETE, deliberately - every
 * other authenticated endpoint in this API implicitly scopes to
 * `claims.workspaceId` (the workspace the caller's own token was issued
 * for) rather than trusting a caller-supplied id; an id param here would
 * need the same re-check connector disconnect() endpoints already do
 * (`findFirst({id, workspaceId: claims.workspaceId})`) to avoid one
 * workspace deleting another's by guessing its id, and there's no
 * legitimate reason for this endpoint to ever act on a workspace other
 * than the caller's own.
 *
 * `POST` is not DELETE's inverse, deliberately - it doesn't act on "the
 * current workspace" at all, it creates a NEW sibling one under the
 * caller's own Organization (Phase 16.1, personal-business-split.md
 * Section 3's "Personal -> Business transition" decision: upgrading
 * never converts an existing workspace in place). The caller's current
 * token still only claims their original workspace, so this returns a
 * fresh token pair scoped to the new one - the same shape register()/
 * login() already return.
 */
@Controller("workspace")
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(
    private readonly deletion: WorkspaceDeletionService,
    private readonly membership: WorkspaceMembershipService,
  ) {}

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOwnWorkspace(@CurrentUser() claims: JwtPayload): Promise<void> {
    await this.deletion.deleteWorkspace(claims.workspaceId, claims.sub);
  }

  @Post()
  async createWorkspace(
    @Body() dto: CreateWorkspaceDto,
    @CurrentUser() claims: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.membership.createWorkspace(claims.sub, claims.orgId, dto.name, buildRequestContext(req));
    setRefreshCookie(res, result.refreshToken);
    return { workspaceId: result.workspaceId, accessToken: result.accessToken };
  }
}
