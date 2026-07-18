import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { TokenService } from "../auth/token.service";

function workspaceRoom(workspaceId: string): string {
  return `workspace:${workspaceId}`;
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
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
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
      client.data.workspaceId = claims.workspaceId;
      client.join(workspaceRoom(claims.workspaceId));
      this.logger.log(`Client ${client.id} authenticated, joined ${workspaceRoom(claims.workspaceId)}`);
    } catch {
      this.logger.warn(`Client ${client.id} presented an invalid/expired token - disconnecting`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitToWorkspace(workspaceId: string, event: string, payload: unknown): void {
    this.server.to(workspaceRoom(workspaceId)).emit(event, payload);
  }

  /** socket.io's documented convention (`auth.token`) is preferred over a query string - a token belongs in the connection handshake payload, not a URL that can end up in logs/proxies. */
  private extractToken(client: Socket): string | undefined {
    const authToken = (client.handshake.auth as { token?: string } | undefined)?.token;
    if (authToken) return authToken;
    return this.tokenService.extractBearerToken(client.handshake.headers.authorization);
  }
}
