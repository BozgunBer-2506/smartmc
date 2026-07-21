import WebSocket from "ws";
import { GatewayOpcode, type DiscordMessage, type GatewayPayload } from "./discord.types";

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

// https://discord.com/developers/docs/events/gateway#gateway-intents
const INTENT_GUILDS = 1 << 0;
const INTENT_GUILD_MESSAGES = 1 << 9;
const INTENT_MESSAGE_CONTENT = 1 << 15; // privileged - must be enabled in the Developer Portal
const INTENTS = INTENT_GUILDS | INTENT_GUILD_MESSAGES | INTENT_MESSAGE_CONTENT;

const MAX_RECONNECT_DELAY_MS = 30_000;

export interface DiscordGatewayHandle {
  stop(): Promise<void>;
}

/**
 * A real Discord Gateway v10 client (ADR-0019): connects outbound over a
 * WebSocket, performs the IDENTIFY handshake, maintains a heartbeat,
 * resumes an existing session across reconnects where possible, and
 * invokes `onMessageCreate` for every real-time `MESSAGE_CREATE` dispatch.
 * This is what "streaming" ingestion means concretely - the platform never
 * sees any of this protocol detail, only the resulting raw message and a
 * `StreamHandle` to stop it.
 */
export function connectDiscordGateway(
  botToken: string,
  onMessageCreate: (message: DiscordMessage) => void,
  onError?: (err: Error) => void,
): DiscordGatewayHandle {
  let ws: WebSocket | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let sequence: number | null = null;
  let sessionId: string | null = null;
  let resumeGatewayUrl: string | null = null;
  let heartbeatAcked = true;
  let stopped = false;
  let reconnectAttempt = 0;

  function clearHeartbeat(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function send(payload: GatewayPayload): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function sendHeartbeat(): void {
    if (!heartbeatAcked) {
      // Zombied connection (no ack since the last beat) - terminate and reconnect, per Discord's own guidance.
      ws?.terminate();
      return;
    }
    heartbeatAcked = false;
    send({ op: GatewayOpcode.HEARTBEAT, d: sequence });
  }

  function scheduleReconnect(): void {
    if (stopped) return;
    clearHeartbeat();
    const delay = Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** reconnectAttempt);
    reconnectAttempt += 1;
    setTimeout(connect, delay);
  }

  function connect(): void {
    if (stopped) return;
    const canResume = Boolean(sessionId && resumeGatewayUrl);
    const url = canResume ? `${resumeGatewayUrl}/?v=10&encoding=json` : GATEWAY_URL;
    ws = new WebSocket(url);

    ws.on("open", () => {
      reconnectAttempt = 0;
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      let payload: GatewayPayload;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (typeof payload.s === "number") sequence = payload.s;

      switch (payload.op) {
        case GatewayOpcode.HELLO: {
          const { heartbeat_interval: interval } = payload.d as { heartbeat_interval: number };
          clearHeartbeat();
          heartbeatAcked = true;
          heartbeatTimer = setInterval(sendHeartbeat, interval);
          if (canResume) {
            send({ op: GatewayOpcode.RESUME, d: { token: `Bot ${botToken}`, session_id: sessionId, seq: sequence } });
          } else {
            send({
              op: GatewayOpcode.IDENTIFY,
              d: {
                token: `Bot ${botToken}`,
                intents: INTENTS,
                properties: { os: "linux", browser: "smart-message-center", device: "smart-message-center" },
              },
            });
          }
          break;
        }
        case GatewayOpcode.DISPATCH:
          if (payload.t === "READY") {
            const ready = payload.d as { session_id: string; resume_gateway_url: string };
            sessionId = ready.session_id;
            resumeGatewayUrl = ready.resume_gateway_url;
          } else if (payload.t === "MESSAGE_CREATE") {
            onMessageCreate(payload.d as DiscordMessage);
          }
          break;
        case GatewayOpcode.HEARTBEAT_ACK:
          heartbeatAcked = true;
          break;
        case GatewayOpcode.RECONNECT:
          ws?.close();
          break;
        case GatewayOpcode.INVALID_SESSION:
          sessionId = null;
          resumeGatewayUrl = null;
          scheduleReconnect();
          break;
        default:
          break;
      }
    });

    ws.on("close", () => {
      clearHeartbeat();
      if (!stopped) scheduleReconnect();
    });

    ws.on("error", (err) => {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    });
  }

  connect();

  return {
    async stop() {
      stopped = true;
      clearHeartbeat();
      ws?.close();
    },
  };
}
