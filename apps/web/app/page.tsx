"use client";

import { useEffect, useState } from "react";
import { Button } from "@smc/ui";
import { DEV_WORKSPACE_ID } from "@smc/shared";
import { getSocket } from "../lib/socket";

interface InboxMessage {
  id: string;
  conversationTitle: string | null;
  sender: { displayName: string; isVip: boolean };
  bodyText: string;
  receivedAt: string;
}

interface ToastNotification {
  id: string;
  title: string;
  body: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Phase 1 Sprint 2's dev Inbox (docs/ROADMAP.md Phase 1 Sprint 2) - a
 * stand-in for the real unified inbox (Phase 9). Proves the full pipeline
 * end to end: a button here triggers the Mock Connector, which flows
 * through the event bus, IdentityGraph, the database, and back out over
 * WebSocket to this page - including a stub automation rule producing a
 * stub notification toast.
 */
export default function InboxPage() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [connected, setConnected] = useState(false);
  const [senderName, setSenderName] = useState("Deniz");
  const [body, setBody] = useState("Hey, are we still on for tomorrow?");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onMessage = (msg: InboxMessage) => setMessages((prev) => [msg, ...prev]);
    const onNotification = (notification: ToastNotification) => {
      setToasts((prev) => [notification, ...prev]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== notification.id));
      }, 6000);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("message.received", onMessage);
    socket.on("notification.created", onNotification);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("message.received", onMessage);
      socket.off("notification.created", onNotification);
    };
  }, []);

  async function sendMockMessage() {
    setSending(true);
    try {
      await fetch(`${API_URL}/dev/mock-connector/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderDisplayName: senderName,
          senderExternalId: senderName.toLowerCase().replace(/\s+/g, "-"),
          bodyText: body,
        }),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 32 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>Smart Message Center - Dev Inbox</h1>
      <p style={{ color: "#9AA5B1", fontSize: 13 }}>
        Workspace: <code>{DEV_WORKSPACE_ID}</code> · WebSocket:{" "}
        <strong style={{ color: connected ? "#3FB27F" : "#E05252" }}>
          {connected ? "connected" : "disconnected"}
        </strong>
      </p>

      <section style={{ display: "flex", gap: 8, margin: "20px 0" }}>
        <input
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          placeholder="Sender name"
          style={inputStyle({ flex: "0 0 160px" })}
        />
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message body"
          style={inputStyle({ flex: 1 })}
        />
        <Button onClick={sendMockMessage} disabled={sending}>
          {sending ? "Sending..." : "Send mock message"}
        </Button>
      </section>

      <section>
        {messages.length === 0 && (
          <p style={{ color: "#9AA5B1" }}>
            No messages yet - trigger the Mock Connector above and watch the full pipeline run.
          </p>
        )}
        {messages.map((m) => (
          <article key={m.id} style={cardStyle}>
            <strong>{m.sender.displayName}</strong>{" "}
            <span style={{ color: "#9AA5B1", fontSize: 12 }}>
              {new Date(m.receivedAt).toLocaleTimeString()}
            </span>
            <p style={{ margin: "4px 0 0" }}>{m.bodyText}</p>
          </article>
        ))}
      </section>

      <div style={toastContainerStyle}>
        {toasts.map((t) => (
          <div key={t.id} style={toastStyle}>
            <strong>{t.title}</strong>
            <p style={{ margin: "2px 0 0", fontSize: 13 }}>{t.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}

function inputStyle(extra: Record<string, string | number>): Record<string, string | number> {
  return {
    padding: 8,
    borderRadius: 6,
    border: "1px solid #2A3441",
    background: "#111726",
    color: "#F5F7FA",
    ...extra,
  };
}

const cardStyle: Record<string, string | number> = {
  border: "1px solid #2A3441",
  borderRadius: 8,
  padding: 12,
  marginBottom: 8,
  background: "#111726",
};

const toastContainerStyle: Record<string, string | number> = {
  position: "fixed",
  top: 16,
  right: 16,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const toastStyle: Record<string, string | number> = {
  background: "#E0A458",
  color: "#1B2333",
  borderRadius: 8,
  padding: "10px 14px",
  minWidth: 220,
  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
};
