import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

function workspaceRoom(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

/**
 * The realtime transport for Phase 1's vertical slice - per docs/API.md
 * Section 11, WebSocket is the primary realtime transport for
 * message.received/notification.created-style events. A client connects
 * with ?workspaceId=... (Phase 1 has no auth yet, docs/ROADMAP.md Phase 2)
 * and joins that workspace's room; the event processor (../events/events.processor.ts)
 * broadcasts into that room.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    const workspaceId = client.handshake.query.workspaceId;
    if (typeof workspaceId === "string" && workspaceId.length > 0) {
      client.join(workspaceRoom(workspaceId));
      this.logger.log(`Client ${client.id} joined ${workspaceRoom(workspaceId)}`);
    } else {
      this.logger.warn(`Client ${client.id} connected without a workspaceId`);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitToWorkspace(workspaceId: string, event: string, payload: unknown): void {
    this.server.to(workspaceRoom(workspaceId)).emit(event, payload);
  }
}
