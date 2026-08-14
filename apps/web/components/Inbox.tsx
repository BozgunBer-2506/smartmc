"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@smc/ui";
import {
  approveMergeSuggestion,
  fetchConversations,
  fetchMergeSuggestions,
  fetchMessages,
  fetchNeedsYouCount,
  fetchNotifications,
  logout,
  markConversationRead,
  API_URL,
  fetchAiCreditBalance,
  rejectMergeSuggestion,
  search,
  sendMessage,
  suggestReplies,
  summarizeConversation,
  triggerMockMessage,
  updateConversation,
  type ConversationMessage,
  type ConversationSummary,
  type MergeSuggestion,
  type NotificationItem,
  type PublicUser,
  type SearchResults,
} from "../lib/api";
import { enqueueRequest } from "../lib/offline-queue";
import { enablePushNotifications, isPushSupported } from "../lib/push";
import { connectSocket, disconnectSocket } from "../lib/socket";
import { playPriorityChime } from "../lib/sound";

/** Not in TypeScript's standard DOM lib yet (docs/ROADMAP.md Phase 14's install-prompt requirement) - the browser-standard shape of the `beforeinstallprompt` event. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InboxProps {
  accessToken: string;
  user: PublicUser;
  onLoggedOut: () => void;
  onOpenRules: () => void;
  onOpenConnectors: () => void;
}

/**
 * The real Inbox (docs/ROADMAP.md Phase 3) - conversations and messages
 * come from Postgres via GET /v1/conversations / GET /v1/conversations/{id}/messages
 * (ADR-0015: REST, not GraphQL, for now), scoped to the authenticated
 * user's own real workspace, not a shared dev fixture (Phase 1). Replaces
 * Phase 1's dev-only page that rendered whatever arrived on an
 * unauthenticated, unscoped WebSocket room.
 */
export function Inbox({ accessToken, user, onLoggedOut, onOpenRules, onOpenConnectors }: InboxProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [aiBalance, setAiBalance] = useState<number | null>(null);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [oauthCallbackStatus, setOauthCallbackStatus] = useState<string | null>(null);
  const [conversationSummary, setConversationSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [replySuggestions, setReplySuggestions] = useState<string[]>([]);
  const [suggestingReplies, setSuggestingReplies] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [senderName, setSenderName] = useState("Alex");
  const [body, setBody] = useState("Hey, are we still on for tomorrow?");
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [needsYouCount, setNeedsYouCount] = useState(0);
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [vipOnly, setVipOnly] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  async function refreshConversations() {
    try {
      const list = await fetchConversations(accessToken, {
        archived: showArchived,
        vip: vipOnly || undefined,
        unread: unreadOnly || undefined,
        category: categoryFilter.trim() || undefined,
      });
      setConversations(list);
      setConversationsError(null);
    } catch (err) {
      // MVP Hardening finding: an empty list here previously looked
      // identical whether the workspace genuinely had no conversations or
      // the request just failed - distinguishing them is what makes the
      // "None yet" empty state trustworthy instead of misleading.
      setConversationsError(err instanceof Error ? err.message : "Could not load conversations.");
    }
  }

  useEffect(() => {
    // The browser's own install-eligibility signal (docs/ROADMAP.md
    // Phase 14) - fires only when the manifest/service-worker/HTTPS
    // criteria are already met, never forced. Capturing it (instead of
    // letting the browser show its own generic prompt) is what lets the
    // product offer a real, in-context "Install" affordance.
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  async function handleInstall() {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
  }

  async function handleEnablePush() {
    const result = await enablePushNotifications(accessToken);
    setPushStatus(result.enabled ? "Push notifications enabled." : (result.reason ?? "Could not enable push notifications."));
  }

  useEffect(() => {
    // Discord's and Slack's OAuth install flows both end with a full-page
    // redirect back to the app's root URL (apps/api/src/discord|slack's
    // callback handlers) - this always lands on the default "inbox" view,
    // never wherever the user actually clicked "Connect" from (the
    // Connectors screen, docs/ROADMAP.md Phase 21.2), so the outcome is
    // surfaced here once, then the URL is cleaned.
    const params = new URLSearchParams(window.location.search);
    const discordResult = params.get("discord");
    if (discordResult) {
      setOauthCallbackStatus(discordResult === "connected" ? "Discord connected." : `Discord connect failed (${discordResult}).`);
      window.history.replaceState({}, "", window.location.pathname);
    }
    const slackResult = params.get("slack");
    if (slackResult) {
      setOauthCallbackStatus(slackResult === "connected" ? "Slack connected." : `Slack connect failed (${slackResult}).`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
    fetchNotifications(accessToken).then(setNotifications).catch(() => undefined);
    fetchNeedsYouCount(accessToken).then((r) => setNeedsYouCount(r.needsYouCount)).catch(() => undefined);
    fetchMergeSuggestions(accessToken).then(setMergeSuggestions).catch(() => undefined);
    fetchAiCreditBalance(accessToken).then((r) => setAiBalance(r.balance)).catch(() => undefined);

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

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      setSearchResults(await search(accessToken, searchQuery.trim()));
    } catch {
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchResults(null);
  }

  async function selectConversation(id: string) {
    setSelectedId(id);
    setConversationSummary(null);
    setReplySuggestions([]);
    const msgs = await fetchMessages(accessToken, id).catch(() => []);
    setMessages(msgs);
    await markConversationRead(accessToken, id).catch(() => undefined);
    refreshConversations();
    fetchNeedsYouCount(accessToken).then((r) => setNeedsYouCount(r.needsYouCount)).catch(() => undefined);
  }

  async function handleSummarize() {
    if (!selectedId) return;
    setSummarizing(true);
    try {
      const result = await summarizeConversation(accessToken, selectedId);
      setConversationSummary(result.summary);
    } catch (err) {
      setConversationSummary(err instanceof Error ? `Could not summarize: ${err.message}` : "Could not summarize.");
    } finally {
      setSummarizing(false);
      fetchAiCreditBalance(accessToken).then((r) => setAiBalance(r.balance)).catch(() => undefined);
    }
  }

  async function handleSuggestReplies() {
    const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
    if (!lastInbound) return;
    setSuggestingReplies(true);
    try {
      const result = await suggestReplies(accessToken, lastInbound.bodyText);
      setReplySuggestions(result.replies);
    } catch {
      setReplySuggestions([]);
    } finally {
      setSuggestingReplies(false);
      fetchAiCreditBalance(accessToken).then((r) => setAiBalance(r.balance)).catch(() => undefined);
    }
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
      // A genuine network failure (offline, per docs/ROADMAP.md Phase 14's
      // background-sync requirement) - not a server-side error (e.g. a
      // mock conversation's 422) - gets queued instead of just failing.
      // `fetch()` rejects with a TypeError specifically for network
      // errors, distinct from the parsed API errors lib/api.ts throws for
      // a real HTTP response.
      if (!navigator.onLine || err instanceof TypeError) {
        try {
          await enqueueRequest({
            id: `${selectedId}-${Date.now()}`,
            url: `${API_URL}/v1/conversations/${selectedId}/messages`,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ body: replyText }),
          });
          setReplyText("");
          setToasts((prev) => [
            { id: `queued-${Date.now()}`, type: "system", title: "Queued", body: "You're offline - this reply will send once you're back online.", createdAt: new Date().toISOString() },
            ...prev,
          ]);
        } catch {
          // eslint-disable-next-line no-alert
          alert("Failed to send reply, and could not queue it for retry either.");
        }
      } else {
        // eslint-disable-next-line no-alert
        alert(err instanceof Error ? err.message : "Failed to send reply.");
      }
    } finally {
      setReplying(false);
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
          /* Single-pane, stack-based navigation below the md breakpoint
             (docs/UI_GUIDE.md Section 15, docs/DESIGN_SYSTEM.md's
             responsive spec) - the list and thread are two full-screen
             views a user pushes/pops between, never both crammed onto
             one small screen at once. */
          .conversations-pane[data-hidden-mobile="true"] { display: none; }
          .messages-pane[data-hidden-mobile="true"] { display: none; }
          .mobile-back-button { display: inline-block !important; }
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
          {aiBalance !== null && (
            <span title="AI credits remaining" style={{ ...needsYouBadgeStyle, background: "#1B2333", color: "#9AA5B1", borderColor: "#2A3441" }}>
              AI credits: {aiBalance}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {installPromptEvent && <Button onClick={handleInstall}>Install app</Button>}
          {isPushSupported() && <Button onClick={handleEnablePush}>Enable push</Button>}
          <Button onClick={onOpenConnectors}>Connectors</Button>
          <Button onClick={onOpenRules}>Automations</Button>
          <Button onClick={handleLogout}>Log out</Button>
        </div>
      </header>

      <section style={{ margin: "0 0 20px" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
          <input
            style={inputStyle({ flex: 1 })}
            placeholder="Search messages and contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button type="submit" disabled={searching}>
            {searching ? "Searching..." : "Search"}
          </Button>
          {searchResults && <Button onClick={clearSearch}>Clear</Button>}
        </form>

        {searchResults && (
          <div style={{ ...cardStyle, marginTop: 8 }}>
            <h2 style={sectionHeading}>
              Messages ({searchResults.messages.length}) - Contacts ({searchResults.contacts.length})
            </h2>
            {searchResults.messages.length === 0 && searchResults.contacts.length === 0 && (
              <p style={{ fontSize: 13, color: "#9AA5B1" }}>No results.</p>
            )}
            {searchResults.messages.map((m) => (
              <div
                key={m.id}
                onClick={() => {
                  selectConversation(m.conversationId);
                  clearSearch();
                }}
                style={{ padding: "6px 0", borderBottom: "1px solid #2A3441", cursor: "pointer", fontSize: 13 }}
              >
                <strong>{m.senderDisplayName ?? m.conversationTitle ?? "Unknown"}</strong>
                <span style={{ color: "#9AA5B1" }}> - {m.bodyText}</span>
              </div>
            ))}
            {searchResults.contacts.map((c) => (
              <div key={c.id} style={{ padding: "6px 0", fontSize: 13 }}>
                {c.displayName} {c.isVip && <span style={{ color: "#E0A458" }}>(VIP)</span>}
              </div>
            ))}
          </div>
        )}
      </section>

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

      {(pushStatus || oauthCallbackStatus) && (
        <section style={{ margin: "0 0 12px", fontSize: 12, color: "#9AA5B1" }}>
          {[pushStatus, oauthCallbackStatus].filter(Boolean).join(" · ")}
        </section>
      )}

      <div className="inbox-grid" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        <section className="conversations-pane" data-hidden-mobile={selectedId ? "true" : "false"}>
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
          {conversationsError && (
            <div style={{ ...cardStyle, borderColor: "#E05252", color: "#E05252", fontSize: 13, marginBottom: 8 }}>
              Could not load conversations: {conversationsError}{" "}
              <button onClick={refreshConversations} style={{ ...smallButtonStyle, marginLeft: 6 }}>
                Retry
              </button>
            </div>
          )}
          {!conversationsError && conversations.length === 0 && (
            <p style={{ color: "#9AA5B1", fontSize: 13 }}>None yet - send a mock message above.</p>
          )}
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

        <section className="messages-pane" data-hidden-mobile={selectedId ? "false" : "true"}>
          <button
            type="button"
            className="mobile-back-button"
            onClick={() => setSelectedId(null)}
            style={{ ...smallButtonStyle, display: "none", marginBottom: 10 }}
          >
            ← Back to conversations
          </button>
          <h2 style={sectionHeading}>Messages</h2>
          {!selectedId && <p style={{ color: "#9AA5B1", fontSize: 13 }}>Select a conversation to see its history.</p>}
          {selectedId && messages.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button onClick={handleSummarize} disabled={summarizing} style={smallButtonStyle}>
                {summarizing ? "Summarizing..." : "Summarize"}
              </button>
              <button onClick={handleSuggestReplies} disabled={suggestingReplies} style={smallButtonStyle}>
                {suggestingReplies ? "Thinking..." : "Suggest replies"}
              </button>
            </div>
          )}
          {conversationSummary && (
            <div style={{ ...cardStyle, borderColor: "#5B8DEF", fontSize: 13 }}>
              <strong>AI summary:</strong> {conversationSummary}
            </div>
          )}
          {replySuggestions.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {replySuggestions.map((r, i) => (
                <button key={i} onClick={() => setReplyText(r)} style={smallButtonStyle}>
                  {r}
                </button>
              ))}
            </div>
          )}
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
