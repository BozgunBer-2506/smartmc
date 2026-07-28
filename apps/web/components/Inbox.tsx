"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@smc/ui";
import {
  approveMergeSuggestion,
  connectDiscord,
  connectEmail,
  connectSlack,
  connectTelegram,
  fetchConversations,
  fetchMergeSuggestions,
  fetchMessages,
  fetchNeedsYouCount,
  fetchNotifications,
  logout,
  markConversationRead,
  rejectMergeSuggestion,
  sendMessage,
  triggerMockMessage,
  updateConversation,
  type ConversationMessage,
  type ConversationSummary,
  type MergeSuggestion,
  type NotificationItem,
  type PublicUser,
} from "../lib/api";
import { PasswordInput } from "./PasswordInput";
import { connectSocket, disconnectSocket } from "../lib/socket";
import { playPriorityChime } from "../lib/sound";

interface InboxProps {
  accessToken: string;
  user: PublicUser;
  onLoggedOut: () => void;
  onOpenRules: () => void;
}

/**
 * The real Inbox (docs/ROADMAP.md Phase 3) - conversations and messages
 * come from Postgres via GET /v1/conversations / GET /v1/conversations/{id}/messages
 * (ADR-0015: REST, not GraphQL, for now), scoped to the authenticated
 * user's own real workspace, not a shared dev fixture (Phase 1). Replaces
 * Phase 1's dev-only page that rendered whatever arrived on an
 * unauthenticated, unscoped WebSocket room.
 */
export function Inbox({ accessToken, user, onLoggedOut, onOpenRules }: InboxProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [senderName, setSenderName] = useState("Alex");
  const [body, setBody] = useState("Hey, are we still on for tomorrow?");
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [connectingTelegram, setConnectingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);
  const [connectingDiscord, setConnectingDiscord] = useState(false);
  const [discordStatus, setDiscordStatus] = useState<string | null>(null);
  const [connectingSlack, setConnectingSlack] = useState(false);
  const [slackStatus, setSlackStatus] = useState<string | null>(null);
  const [imapHost, setImapHost] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [emailUsername, setEmailUsername] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [connectingEmail, setConnectingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [needsYouCount, setNeedsYouCount] = useState(0);
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [vipOnly, setVipOnly] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  async function refreshConversations() {
    const list = await fetchConversations(accessToken, {
      archived: showArchived,
      vip: vipOnly || undefined,
      unread: unreadOnly || undefined,
      category: categoryFilter.trim() || undefined,
    }).catch(() => []);
    setConversations(list);
  }

  useEffect(() => {
    // Discord's OAuth2 install flow ends with a full-page redirect back
    // here from apps/api/src/discord/discord.controller.ts's callback -
    // surface the outcome once, then clean the URL.
    const params = new URLSearchParams(window.location.search);
    const discordResult = params.get("discord");
    if (discordResult) {
      setDiscordStatus(discordResult === "connected" ? "Discord connected." : `Discord connect failed (${discordResult}).`);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // Slack's OAuth v2 install flow ends with the same kind of full-page
    // redirect back here, from apps/api/src/slack/slack.controller.ts's
    // callback - identical pattern to Discord's, one query param apart.
    const slackResult = params.get("slack");
    if (slackResult) {
      setSlackStatus(slackResult === "connected" ? "Slack connected." : `Slack connect failed (${slackResult}).`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
    fetchNotifications(accessToken).then(setNotifications).catch(() => undefined);
    fetchNeedsYouCount(accessToken).then((r) => setNeedsYouCount(r.needsYouCount)).catch(() => undefined);
    fetchMergeSuggestions(accessToken).then(setMergeSuggestions).catch(() => undefined);

    const socket = connectSocket(accessToken);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onMessage = (payload?: { priorityScore?: number }) => {
      // A new message arrived for this workspace - refresh the
      // conversation list (updates ordering/preview), and if the affected
      // conversation is the one currently open, refresh its messages too.
      refreshConversations();
      fetchNeedsYouCount(accessToken).then((r) => setNeedsYouCount(r.needsYouCount)).catch(() => undefined);
      if (selectedIdRef.current) {
        fetchMessages(accessToken, selectedIdRef.current).then(setMessages).catch(() => undefined);
      }
    };

    // Priority-based sound cue (docs/ROADMAP.md Phase 11) - only for a
    // real inbound message, never for the user's own outbound reply.
    const onMessageReceived = (payload?: { priorityScore?: number }) => {
      onMessage(payload);
      playPriorityChime(payload?.priorityScore ?? 0);
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
    socket.on("message.received", onMessageReceived);
    socket.on("message.sent", onMessage);
    socket.on("notification.created", onNotification);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("message.received", onMessageReceived);
      socket.off("message.sent", onMessage);
      socket.off("notification.created", onNotification);
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    refreshConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived, vipOnly, unreadOnly, categoryFilter]);

  async function selectConversation(id: string) {
    setSelectedId(id);
    const msgs = await fetchMessages(accessToken, id).catch(() => []);
    setMessages(msgs);
    await markConversationRead(accessToken, id).catch(() => undefined);
    refreshConversations();
    fetchNeedsYouCount(accessToken).then((r) => setNeedsYouCount(r.needsYouCount)).catch(() => undefined);
  }

  async function handleToggleArchive(conversation: ConversationSummary) {
    await updateConversation(accessToken, conversation.id, { isArchived: !conversation.isArchived }).catch(() => undefined);
    refreshConversations();
  }

  async function handleSetCategory(conversation: ConversationSummary, category: string) {
    await updateConversation(accessToken, conversation.id, { category: category.trim() || null }).catch(() => undefined);
    refreshConversations();
  }

  async function handleApproveSuggestion(id: string) {
    await approveMergeSuggestion(accessToken, id).catch(() => undefined);
    setMergeSuggestions((prev) => prev.filter((s) => s.id !== id));
    refreshConversations();
  }

  async function handleRejectSuggestion(id: string) {
    await rejectMergeSuggestion(accessToken, id).catch(() => undefined);
    setMergeSuggestions((prev) => prev.filter((s) => s.id !== id));
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

  async function handleReply() {
    if (!selectedId || !replyText.trim()) return;
    setReplying(true);
    try {
      await sendMessage(accessToken, selectedId, replyText);
      setReplyText("");
      const msgs = await fetchMessages(accessToken, selectedId).catch(() => []);
      setMessages(msgs);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : "Failed to send reply.");
    } finally {
      setReplying(false);
    }
  }

  async function handleConnectTelegram() {
    if (!botToken.trim()) return;
    setConnectingTelegram(true);
    setTelegramStatus(null);
    try {
      const result = await connectTelegram(accessToken, botToken.trim());
      setTelegramStatus(`Connected (status: ${result.status}, webhook: ${result.webhookRegistered ? "registered" : "reconciliation-only"})`);
      setBotToken("");
    } catch (err) {
      setTelegramStatus(err instanceof Error ? err.message : "Failed to connect Telegram bot.");
    } finally {
      setConnectingTelegram(false);
    }
  }

  async function handleConnectDiscord() {
    setConnectingDiscord(true);
    try {
      const { authorizationUrl } = await connectDiscord(accessToken);
      window.location.href = authorizationUrl; // full-page redirect - Discord's OAuth2 install flow, not an API call
    } catch (err) {
      setDiscordStatus(err instanceof Error ? err.message : "Failed to start the Discord connect flow.");
      setConnectingDiscord(false);
    }
  }

  async function handleConnectSlack() {
    setConnectingSlack(true);
    try {
      const { authorizationUrl } = await connectSlack(accessToken);
      window.location.href = authorizationUrl; // full-page redirect - Slack's OAuth v2 install flow, not an API call
    } catch (err) {
      setSlackStatus(err instanceof Error ? err.message : "Failed to start the Slack connect flow.");
      setConnectingSlack(false);
    }
  }

  async function handleConnectEmail() {
    if (!imapHost.trim() || !smtpHost.trim() || !emailUsername.trim() || !emailPassword.trim()) return;
    setConnectingEmail(true);
    setEmailStatus(null);
    try {
      const result = await connectEmail(accessToken, {
        imapHost: imapHost.trim(),
        imapPort: 993,
        imapSecure: true,
        smtpHost: smtpHost.trim(),
        smtpPort: 465,
        smtpSecure: true,
        username: emailUsername.trim(),
        password: emailPassword,
      });
      setEmailStatus(`Connected (status: ${result.status}, polling for new mail)`);
      setEmailPassword("");
    } catch (err) {
      setEmailStatus(err instanceof Error ? err.message : "Failed to connect the mailbox.");
    } finally {
      setConnectingEmail(false);
    }
  }

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
      <style>{`
        @media (max-width: 720px) {
          .inbox-grid { grid-template-columns: 1fr !important; }
          .connector-row { flex-direction: column; align-items: stretch !important; }
        }
      `}</style>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Smart Message Center</h1>
            <p style={{ color: "#9AA5B1", fontSize: 13, margin: "4px 0 0" }}>
              {user.displayName ?? user.email} · Realtime:{" "}
              <strong style={{ color: connected ? "#3FB27F" : "#E05252" }}>
                {connected ? "connected" : "disconnected"}
              </strong>
            </p>
          </div>
          <span
            title="Unread conversations that are VIP or high-priority"
            style={{
              ...needsYouBadgeStyle,
              background: needsYouCount > 0 ? "#E0A458" : "#1B2333",
              color: needsYouCount > 0 ? "#1B2333" : "#9AA5B1",
              borderColor: needsYouCount > 0 ? "#E0A458" : "#2A3441",
            }}
          >
            Needs You: {needsYouCount}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={onOpenRules}>Automations</Button>
          <Button onClick={handleLogout}>Log out</Button>
        </div>
      </header>

      {mergeSuggestions.length > 0 && (
        <section style={{ margin: "0 0 20px" }}>
          <h2 style={sectionHeading}>Possible duplicate contacts</h2>
          {mergeSuggestions.map((s) => (
            <article key={s.id} style={{ ...cardStyle, borderColor: "#E0A458", borderLeftWidth: 3 }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                <strong>{s.contactA?.displayName ?? "Unknown"}</strong> and <strong>{s.contactB?.displayName ?? "Unknown"}</strong> might be the same person
                {" "}({Math.round(s.confidenceScore * 100)}% confidence - {s.matchingSignals.reason})
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Button onClick={() => handleApproveSuggestion(s.id)}>Merge</Button>
                <Button onClick={() => handleRejectSuggestion(s.id)}>Not the same person</Button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section style={{ display: "flex", gap: 8, margin: "20px 0" }}>
        <input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Sender name" style={inputStyle({ flex: "0 0 160px" })} />
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body" style={inputStyle({ flex: 1 })} />
        <Button onClick={handleSendMock} disabled={sending}>
          {sending ? "Sending..." : "Send mock message"}
        </Button>
      </section>

      <section style={{ margin: "0 0 20px", border: "1px solid #2A3441", borderRadius: 8, padding: 16 }}>
        <h2 style={sectionHeading}>Connect a channel</h2>

        <div className="connector-row" style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="Telegram bot token (from @BotFather)"
            style={inputStyle({ flex: "1 1 240px" })}
          />
          <Button onClick={handleConnectTelegram} disabled={connectingTelegram}>
            {connectingTelegram ? "Connecting..." : "Connect Telegram"}
          </Button>
          {telegramStatus && <span style={{ fontSize: 12, color: "#9AA5B1" }}>{telegramStatus}</span>}
        </div>

        <div className="connector-row" style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
          <Button onClick={handleConnectDiscord} disabled={connectingDiscord}>
            {connectingDiscord ? "Redirecting..." : "Connect Discord"}
          </Button>
          <Button onClick={handleConnectSlack} disabled={connectingSlack}>
            {connectingSlack ? "Redirecting..." : "Connect Slack"}
          </Button>
          {discordStatus && <span style={{ fontSize: 12, color: "#9AA5B1" }}>{discordStatus}</span>}
          {slackStatus && <span style={{ fontSize: 12, color: "#9AA5B1" }}>{slackStatus}</span>}
        </div>

        <div className="connector-row" style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="IMAP host (imap.gmail.com)" style={inputStyle({ flex: "1 1 190px" })} />
          <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="SMTP host (smtp.gmail.com)" style={inputStyle({ flex: "1 1 190px" })} />
          <input value={emailUsername} onChange={(e) => setEmailUsername(e.target.value)} placeholder="Email address" style={inputStyle({ flex: "1 1 190px" })} />
          <PasswordInput
            value={emailPassword}
            onChange={setEmailPassword}
            placeholder="App password"
            containerStyle={{ flex: "1 1 160px" }}
            hint="Gmail/Outlook require an app-specific password, not your account password."
          />
          <Button onClick={handleConnectEmail} disabled={connectingEmail}>
            {connectingEmail ? "Connecting..." : "Connect Email"}
          </Button>
          {emailStatus && <span style={{ fontSize: 12, color: "#9AA5B1" }}>{emailStatus}</span>}
        </div>
      </section>

      <div className="inbox-grid" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        <section>
          <h2 style={sectionHeading}>Conversations</h2>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10, fontSize: 12, color: "#9AA5B1" }}>
            <label style={filterLabelStyle}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived
            </label>
            <label style={filterLabelStyle}>
              <input type="checkbox" checked={vipOnly} onChange={(e) => setVipOnly(e.target.checked)} /> VIP only
            </label>
            <label style={filterLabelStyle}>
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Unread only
            </label>
            <input
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              placeholder="Category filter"
              style={inputStyle({ width: 100, fontSize: 12 })}
            />
          </div>
          {conversations.length === 0 && <p style={{ color: "#9AA5B1", fontSize: 13 }}>None yet - send a mock message above.</p>}
          {conversations.map((c) => (
            <article
              key={c.id}
              style={{
                ...cardStyle,
                borderColor: selectedId === c.id ? "#E0A458" : "#2A3441",
              }}
            >
              <div onClick={() => selectConversation(c.id)} style={{ cursor: "pointer" }}>
                <strong>
                  {c.unread && "● "}
                  {c.title ?? c.lastMessage?.sender?.displayName ?? "Unknown"}
                  {c.lastMessage?.sender?.isVip && " ⭐"}
                </strong>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9AA5B1" }}>{c.lastMessage?.bodyText ?? ""}</p>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#6B7686" }}>
                  priority {c.priorityScore}
                  {c.category ? ` · ${c.category}` : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => handleToggleArchive(c)} style={smallButtonStyle}>
                  {c.isArchived ? "Unarchive" : "Archive"}
                </button>
                <input
                  defaultValue={c.category ?? ""}
                  onBlur={(e) => handleSetCategory(c, e.target.value)}
                  placeholder="Set category"
                  style={inputStyle({ flex: 1, fontSize: 11, padding: 4 })}
                />
              </div>
            </article>
          ))}
        </section>

        <section>
          <h2 style={sectionHeading}>Messages</h2>
          {!selectedId && <p style={{ color: "#9AA5B1", fontSize: 13 }}>Select a conversation to see its history.</p>}
          {messages.map((m) => (
            <article key={m.id} style={cardStyle}>
              <strong>{m.direction === "outbound" ? "Me" : (m.sender?.displayName ?? "Unknown")}</strong>{" "}
              <span style={{ color: "#9AA5B1", fontSize: 12 }}>{new Date(m.receivedAt).toLocaleTimeString()}</span>
              <p style={{ margin: "4px 0 0" }}>{m.bodyText}</p>
            </article>
          ))}
          {selectedId && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleReply()}
                placeholder="Reply..."
                style={inputStyle({ flex: 1 })}
              />
              <Button onClick={handleReply} disabled={replying || !replyText.trim()}>
                {replying ? "Sending..." : "Reply"}
              </Button>
            </div>
          )}
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

const filterLabelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "5px 8px",
  borderRadius: 6,
  cursor: "pointer",
};

const needsYouBadgeStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 100,
  border: "1px solid",
  whiteSpace: "nowrap",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #2A3441",
  borderRadius: 8,
  padding: 12,
  marginBottom: 8,
  background: "#111726",
};

const smallButtonStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "4px 8px",
  borderRadius: 4,
  border: "1px solid #2A3441",
  background: "#1B2333",
  color: "#F5F7FA",
  cursor: "pointer",
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
