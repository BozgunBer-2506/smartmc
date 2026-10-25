import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { getPrismaClient } from "@smc/database";
import type { Server, Socket } from "socket.io";
import { TokenService } from "../auth/token.service";
import { socketCorsOrigin } from "../config/cors.config";

function workspaceRoom(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

/**
 * A second, finer-grained room every connection also joins alongside
 * `workspaceRoom` - lets a caller disconnect exactly one (user,
 * workspace) pair's sockets (a departing member of a surviving shared
 * workspace) without touching anyone else in `workspaceRoom`, which a
 * plain "disconnect everyone in this workspace" call would. Native
 * Socket.IO room mechanism, not a new tracking structure - the adapter
 * already maintains room membership, `disconnectSockets()` is a
 * documented built-in.
 */
function memberRoom(workspaceId: string, userId: string): string {
  return `member:${workspaceId}:${userId}`;
}

/**
 * The realtime transport (docs/API.md Section 11): "Connection
 * authenticates via the same JWT as REST, passed at connect time... a
 * client cannot subscribe to a workspace it isn't authorized for." Phase 1
 * shipped a shortcut (a client-supplied `?workspaceId=` query param, no
 * verification) to prove the pipeline shape cheaply; Phase 3 replaces it
 * with the real mechanism this section always specified - not a new
 * design, the one that was deferred.
 *
 * The workspace a connection joins is *always* derived from the verified
 * token's claims, never from anything the client asserts - a connection
 * with no token, or an invalid one, is disconnected immediately.
 *
 * Phase 2B security review addition: a signature-valid, unexpired token
 * is not enough on its own here either (the same reasoning
 * jwt-auth.guard.ts's own fix documents) - this gateway calls
 * TokenService directly, bypassing that HTTP-only guard entirely, so it
 * needs its own equivalent check. A single query against WorkspaceMember
 * covers BOTH "does this user still exist" and "are they still a member
 * of this workspace": WorkspaceMember.userId is a required (RESTRICT)
 * foreign key to User, so a WorkspaceMember row cannot exist unless its
 * User row does too - deleting a User always removes their memberships
 * first (account-deletion.service.ts). A deleted account or a removed
 * membership therefore fails this one lookup identically, with no second
 * query needed.
 */
// Same explicit allowlist as the REST API (config/cors.config.ts), never a reflected origin.
@WebSocketGateway({ cors: { origin: socketCorsOrigin, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly tokenService: TokenService) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);

    if (!token) {
      this.logger.warn(`Client ${client.id} connected without a token - disconnecting`);
      client.disconnect(true);
      return;
    }

    try {
      const claims = await this.tokenService.verify(token);

      const prisma = getPrismaClient();
      const membership = await prisma.workspaceMember.findFirst({
        where: { workspaceId: claims.workspaceId, userId: claims.sub },
      });
      if (!membership) {
        this.logger.warn(`Client ${client.id} presented a token for a deleted account or removed membership - disconnecting`);
        client.disconnect(true);
        return;
      }

      client.data.workspaceId = claims.workspaceId;
      client.data.userId = claims.sub;
      client.join(workspaceRoom(claims.workspaceId));
      client.join(memberRoom(claims.workspaceId, claims.sub));
      this.logger.log(`Client ${client.id} authenticated, joined ${workspaceRoom(claims.workspaceId)}`);
    } catch {
      this.logger.warn(`Client ${client.id} presented an invalid/expired token, or a DB check failed - disconnecting`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitToWorkspace(workspaceId: string, event: string, payload: unknown): void {
    this.server.to(workspaceRoom(workspaceId)).emit(event, payload);
  }

  /**
   * The whole workspace no longer exists for anyone - every connection in
   * the room is kicked, not just one. Called AFTER the deleting
   * transaction has already committed (workspace-deletion.service.ts) -
   * `disconnectSockets()` is synchronous, not a Promise (confirmed
   * against socket.io's own type declarations: `disconnectSockets(close?:
   * boolean): void`), so a failure here is a synchronous throw, not an
   * unhandled rejection - but either way it must never escape as an
   * exception back to a caller whose actual database work already
   * succeeded. Best-effort cleanup only, same posture as every other
   * post-commit side effect in this codebase (the audit log write right
   * after this, connector cleanup in the same file).
   */
  disconnectWorkspace(workspaceId: string): void {
    try {
      this.server.in(workspaceRoom(workspaceId)).disconnectSockets(true);
    } catch (err) {
      this.logger.warn(`Failed to disconnect sockets for deleted workspace ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Exactly one departing (user, workspace) pair - every other member of a surviving shared workspace keeps their connection. Same best-effort reasoning as disconnectWorkspace above. */
  disconnectMember(workspaceId: string, userId: string): void {
    try {
      this.server.in(memberRoom(workspaceId, userId)).disconnectSockets(true);
    } catch (err) {
      this.logger.warn(`Failed to disconnect sockets for removed member ${userId} of workspace ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** socket.io's documented convention (`auth.token`) is preferred over a query string - a token belongs in the connection handshake payload, not a URL that can end up in logs/proxies. */
  private extractToken(client: Socket): string | undefined {
    const authToken = (client.handshake.auth as { token?: string } | undefined)?.token;
    if (authToken) return authToken;
    return this.tokenService.extractBearerToken(client.handshake.headers.authorization);
  }
}
