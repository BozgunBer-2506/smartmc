"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@smc/ui";
import {
  fetchConversations,
  fetchMessages,
  fetchNotifications,
  logout,
  triggerMockMessage,
  type ConversationMessage,
  type ConversationSummary,
  type NotificationItem,
  type PublicUser,
} from "../lib/api";
import { connectSocket, disconnectSocket } from "../lib/socket";

interface InboxProps {
  accessToken: string;
  user: PublicUser;
  onLoggedOut: () => void;
}

/**
 * The real Inbox (docs/ROADMAP.md Phase 3) - conversations and messages
 * come from Postgres via GET /v1/conversations / GET /v1/conversations/{id}/messages
 * (ADR-0015: REST, not GraphQL, for now), scoped to the authenticated
 * user's own real workspace, not a shared dev fixture (Phase 1). Replaces
 * Phase 1's dev-only page that rendered whatever arrived on an
 * unauthenticated, unscoped WebSocket room.
 */
export function Inbox({ accessToken, user, onLoggedOut }: InboxProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [senderName, setSenderName] = useState("Deniz");
  const [body, setBody] = useState("Hey, are we still on for tomorrow?");
  const [sending, setSending] = useState(false);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    fetchConversations(accessToken).then(setConversations).catch(() => undefined);
    fetchNotifications(accessToken).then(setNotifications).catch(() => undefined);

    const socket = connectSocket(accessToken);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onMessage = () => {
      // A new message arrived for this workspace - refresh the
      // conversation list (updates ordering/preview), and if the affected
      // conversation is the one currently open, refresh its messages too.
      fetchConversations(accessToken).then(setConversations).catch(() => undefined);
      if (selectedIdRef.current) {
        fetchMessages(accessToken, selectedIdRef.current).then(setMessages).catch(() => undefined);
      }
    };

    const onNotification = (notification: NotificationItem) => {
      setNotifications((prev) => [notification, ...prev]);
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
      disconnectSocket();
    };
  }, [accessToken]);

  async function selectConversation(id: string) {
    setSelectedId(id);
    const msgs = await fetchMessages(accessToken, id).catch(() => []);
    setMessages(msgs);
  }

  async function handleSendMock() {
    setSending(true);
    try {
      await triggerMockMessage(accessToken, {
        senderDisplayName: senderName,
        senderExternalId: senderName.toLowerCase().replace(/\s+/g, "-"),
        bodyText: body,
      });
    } finally {
      setSending(false);
    }
  }

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Smart Message Center</h1>
          <p style={{ color: "#9AA5B1", fontSize: 13, margin: "4px 0 0" }}>
            {user.displayName ?? user.email} · Realtime:{" "}
            <strong style={{ color: connected ? "#3FB27F" : "#E05252" }}>
              {connected ? "connected" : "disconnected"}
            </strong>
          </p>
        </div>
        <Button onClick={handleLogout}>Log out</Button>
      </header>

      <section style={{ display: "flex", gap: 8, margin: "20px 0" }}>
        <input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Sender name" style={inputStyle({ flex: "0 0 160px" })} />
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body" style={inputStyle({ flex: 1 })} />
        <Button onClick={handleSendMock} disabled={sending}>
          {sending ? "Sending..." : "Send mock message"}
        </Button>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        <section>
          <h2 style={sectionHeading}>Conversations</h2>
          {conversations.length === 0 && <p style={{ color: "#9AA5B1", fontSize: 13 }}>None yet - send a mock message above.</p>}
          {conversations.map((c) => (
            <article
              key={c.id}
              onClick={() => selectConversation(c.id)}
              style={{
                ...cardStyle,
                cursor: "pointer",
                borderColor: selectedId === c.id ? "#E0A458" : "#2A3441",
              }}
            >
              <strong>{c.title ?? c.lastMessage?.sender?.displayName ?? "Unknown"}</strong>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9AA5B1" }}>{c.lastMessage?.bodyText ?? ""}</p>
            </article>
          ))}
        </section>

        <section>
          <h2 style={sectionHeading}>Messages</h2>
          {!selectedId && <p style={{ color: "#9AA5B1", fontSize: 13 }}>Select a conversation to see its history.</p>}
          {messages.map((m) => (
            <article key={m.id} style={cardStyle}>
              <strong>{m.sender?.displayName ?? "Me"}</strong>{" "}
              <span style={{ color: "#9AA5B1", fontSize: 12 }}>{new Date(m.receivedAt).toLocaleTimeString()}</span>
              <p style={{ margin: "4px 0 0" }}>{m.bodyText}</p>
            </article>
          ))}
        </section>
      </div>

      <section style={{ marginTop: 24 }}>
        <h2 style={sectionHeading}>Notifications</h2>
        {notifications.length === 0 && <p style={{ color: "#9AA5B1", fontSize: 13 }}>None yet.</p>}
        {notifications.map((n) => (
          <article key={n.id} style={cardStyle}>
            <strong>{n.title}</strong>
            <p style={{ margin: "4px 0 0", fontSize: 13 }}>{n.body}</p>
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
  return { padding: 8, borderRadius: 6, border: "1px solid #2A3441", background: "#111726", color: "#F5F7FA", ...extra };
}

const sectionHeading: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: "#9AA5B1", margin: "0 0 8px" };

const cardStyle: React.CSSProperties = {
  border: "1px solid #2A3441",
  borderRadius: 8,
  padding: 12,
  marginBottom: 8,
  background: "#111726",
};

const toastContainerStyle: React.CSSProperties = {
  position: "fixed",
  top: 16,
  right: 16,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const toastStyle: React.CSSProperties = {
  background: "#E0A458",
  color: "#1B2333",
  borderRadius: 8,
  padding: "10px 14px",
  minWidth: 220,
  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
};
