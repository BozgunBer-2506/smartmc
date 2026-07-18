import { io, type Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let socket: Socket | undefined;

/**
 * A single shared socket.io connection per browser tab. Phase 3
 * (docs/API.md Section 11): the connection authenticates with the same
 * JWT as REST, passed via socket.io's `auth` handshake payload - the
 * server derives the workspace room from the verified token, never from
 * anything the client asserts (docs/ROADMAP.md Phase 3, replacing Phase
 * 1's `?workspaceId=` shortcut). Reconnects with a fresh token whenever
 * one changes (e.g. after a refresh), since the old connection was
 * authenticated with whatever token it opened with.
 */
export function connectSocket(accessToken: string): Socket {
  if (socket) {
    socket.disconnect();
  }
  socket = io(API_URL, {
    auth: { token: accessToken },
    transports: ["websocket"],
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = undefined;
}
