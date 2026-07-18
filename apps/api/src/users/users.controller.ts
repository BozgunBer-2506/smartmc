import { Controller, Get, UseGuards } from "@nestjs/common";
import { getPrismaClient } from "@smc/database";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { toPublicUser } from "../auth/auth.utils";
import { authError } from "../auth/auth.exceptions";
import { HttpStatus } from "@nestjs/common";

/**
 * docs/API.md Section 10.2 - GET /v1/users/me: "every client needs 'who
 * am I' on load." Protected by JwtAuthGuard (docs/ROADMAP.md Phase 2's
 * "Protected API routes" Definition of Done item).
 */
@Controller("users")
export class UsersController {
  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();
    const user = await prisma.user.findFirst({ where: { id: claims.sub } });

    if (!user) {
      throw authError(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "User not found.");
    }

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: claims.sub },
      include: { workspace: true },
      orderBy: { joinedAt: "asc" },
    });

    return {
      user: toPublicUser(user),
      workspaces: memberships.map((m) => ({
        workspaceId: m.workspaceId,
        workspaceName: m.workspace.name,
        organizationId: m.workspace.organizationId,
        role: m.role,
      })),
    };
  }
}
