import { io, type Socket } from "socket.io-client";
import { DEV_WORKSPACE_ID } from "@smc/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let socket: Socket | undefined;

/** A single shared socket.io connection per browser tab, joined to the dev workspace's room (docs/API.md Section 11). */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      query: { workspaceId: DEV_WORKSPACE_ID },
      transports: ["websocket"],
    });
  }
  return socket;
}
