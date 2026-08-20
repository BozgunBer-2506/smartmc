"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Input, ProviderBadge, Skeleton, ThemeToggle } from "@smc/ui";
import {
  approveMergeSuggestion,
  cancelScheduledMessage,
  fetchConversations,
  fetchMergeSuggestions,
  fetchMessages,
  fetchNeedsYouCount,
  fetchNotifications,
  fetchScheduledMessages,
  logout,
  markConversationRead,
  markConversationUnread,
  API_URL,
  fetchAiCreditBalance,
  rejectMergeSuggestion,
  scheduleMessage,
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
  type ScheduledMessage,
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

const smallButtonClass =
  "rounded-sm border border-border-subtle bg-surface-2 px-2 py-1 text-[11px] text-text-primary hover:border-border-strong";

/**
 * The real Inbox (docs/ROADMAP.md Phase 3) - conversations and messages
 * come from Postgres via GET /v1/conversations / GET /v1/conversations/{id}/messages
 * (ADR-0015: REST, not GraphQL, for now), scoped to the authenticated
 * user's own real workspace, not a shared dev fixture (Phase 1). Replaces
 * Phase 1's dev-only page that rendered whatever arrived on an
 * unauthenticated, unscoped WebSocket room.
 *
 * Migrated onto the real design system (docs/ROADMAP.md Phase 22) - the
 * first screen to prove `packages/ui`'s primitives and `packages/design-tokens`'
 * tokens against a real, already-tested screen (every Phase 21.3 behavior
 * below - provider badges, unread state, loading skeletons, filtered/empty
 * states - is preserved exactly, not rebuilt).
 */
export function Inbox({ accessToken, user, onLoggedOut, onOpenRules, onOpenConnectors }: InboxProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
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
  const [scheduleAt, setScheduleAt] = useState("");
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
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
    } finally {
      setConversationsLoading(false);
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

  useEffect(() => {
    refreshScheduledMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setShowScheduler(false);
    setScheduleAt("");
    setMessagesLoading(true);
    const msgs = await fetchMessages(accessToken, id).catch(() => []);
    setMessages(msgs);
    setMessagesLoading(false);
    await markConversationRead(accessToken, id).catch(() => undefined);
    refreshConversations();
    fetchNeedsYouCount(accessToken).then((r) => setNeedsYouCount(r.needsYouCount)).catch(() => undefined);
    refreshScheduledMessages();
  }

  async function handleMarkUnread(conversation: ConversationSummary) {
    await markConversationUnread(accessToken, conversation.id).catch(() => undefined);
    refreshConversations();
    fetchNeedsYouCount(accessToken).then((r) => setNeedsYouCount(r.needsYouCount)).catch(() => undefined);
  }

  function refreshScheduledMessages() {
    fetchScheduledMessages(accessToken).then(setScheduledMessages).catch(() => undefined);
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

  function clearConversationFilters() {
    setShowArchived(false);
    setVipOnly(false);
    setUnreadOnly(false);
    setCategoryFilter("");
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

  /** Schedules the current reply text for a future send instead of sending it now (docs/ROADMAP.md Phase 21.6) - e.g. writing a reply at night and having it go out at 8am. */
  async function handleSchedule() {
    if (!selectedId || !replyText.trim() || !scheduleAt) return;
    const sendAtDate = new Date(scheduleAt);
    if (Number.isNaN(sendAtDate.getTime()) || sendAtDate.getTime() <= Date.now()) {
      // eslint-disable-next-line no-alert
      alert("Pick a time in the future.");
      return;
    }
    setScheduling(true);
    try {
      await scheduleMessage(accessToken, selectedId, replyText, sendAtDate.toISOString());
      setReplyText("");
      setScheduleAt("");
      setShowScheduler(false);
      refreshScheduledMessages();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : "Failed to schedule message.");
    } finally {
      setScheduling(false);
    }
  }

  async function handleCancelScheduled(id: string) {
    try {
      await cancelScheduledMessage(accessToken, id);
      refreshScheduledMessages();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : "Failed to cancel scheduled message.");
    }
  }

  async function handleLogout() {
    await logout();
    onLoggedOut();
  }

  const filtersActive = showArchived || vipOnly || unreadOnly || categoryFilter.trim().length > 0;

  return (
    <main className="mx-auto max-w-[900px] p-8">
      <header className="mb-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div>
            <h1 className="m-0 text-xl font-semibold text-text-primary">Smart Message Center</h1>
            <p className="mt-1 text-[13px] text-text-secondary">
              {user.displayName ?? user.email} · Realtime:{" "}
              <strong className={connected ? "text-status-success" : "text-status-danger"}>
                {connected ? "connected" : "disconnected"}
              </strong>
            </p>
          </div>
          <Badge variant={needsYouCount > 0 ? "priority" : "neutral"} title="Unread conversations that are VIP or high-priority">
            Needs You: {needsYouCount}
          </Badge>
          {aiBalance !== null && <Badge title="AI credits remaining">AI credits: {aiBalance}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {installPromptEvent && <Button onClick={handleInstall}>Install app</Button>}
          {isPushSupported() && <Button onClick={handleEnablePush}>Enable push</Button>}
          <Button onClick={onOpenConnectors}>Connectors</Button>
          <Button onClick={onOpenRules}>Automations</Button>
          <Button onClick={handleLogout}>Log out</Button>
        </div>
      </header>

      <section className="my-5">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            className="flex-1"
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
          <Card className="mt-2">
            <h2 className="mb-2 text-sm font-semibold text-text-secondary">
              Messages ({searchResults.messages.length}) - Contacts ({searchResults.contacts.length})
            </h2>
            {searchResults.messages.length === 0 && searchResults.contacts.length === 0 && (
              <p className="text-[13px] text-text-secondary">No results.</p>
            )}
            {searchResults.messages.map((m) => (
              <div
                key={m.id}
                onClick={() => {
                  selectConversation(m.conversationId);
                  clearSearch();
                }}
                className="cursor-pointer border-b border-border-subtle py-1.5 text-[13px]"
              >
                <strong>{m.senderDisplayName ?? m.conversationTitle ?? "Unknown"}</strong>
                <span className="text-text-secondary"> - {m.bodyText}</span>
              </div>
            ))}
            {searchResults.contacts.map((c) => (
              <div key={c.id} className="py-1.5 text-[13px]">
                {c.displayName} {c.isVip && <span className="text-accent-priority">(VIP)</span>}
              </div>
            ))}
          </Card>
        )}
      </section>

      {mergeSuggestions.length > 0 && (
        <section className="my-5">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">Possible duplicate contacts</h2>
          {mergeSuggestions.map((s) => (
            <Card key={s.id} className="border-l-[3px] border-l-accent-priority">
              <p className="m-0 text-[13px]">
                <strong>{s.contactA?.displayName ?? "Unknown"}</strong> and <strong>{s.contactB?.displayName ?? "Unknown"}</strong> might be the same person
                {" "}({Math.round(s.confidenceScore * 100)}% confidence - {s.matchingSignals.reason})
              </p>
              <div className="mt-2 flex gap-2">
                <Button onClick={() => handleApproveSuggestion(s.id)}>Merge</Button>
                <Button onClick={() => handleRejectSuggestion(s.id)}>Not the same person</Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      {process.env.NODE_ENV !== "production" && (
        // Dev-only test tool (POST /dev/mock-connector/send, docs/ROADMAP.md
        // Phase 21.5) - the backend itself 404s this route outside
        // development (mock-connector.controller.ts), so this UI must match
        // that guard rather than render a control that silently fails for a
        // real production user.
        <section className="my-5 flex gap-2">
          <Input className="w-40 flex-none" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Sender name" />
          <Input className="flex-1" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message body" />
          <Button onClick={handleSendMock} disabled={sending}>
            {sending ? "Sending..." : "Send mock message"}
          </Button>
        </section>
      )}

      {(pushStatus || oauthCallbackStatus) && (
        <section className="mb-3 text-xs text-text-secondary">{[pushStatus, oauthCallbackStatus].filter(Boolean).join(" · ")}</section>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        <section className={selectedId ? "hidden md:block" : "block"}>
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">Conversations</h2>
          <div className="mb-2.5 flex flex-wrap gap-1 text-xs text-text-secondary">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1">
              <input type="checkbox" checked={vipOnly} onChange={(e) => setVipOnly(e.target.checked)} /> VIP only
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1">
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Unread only
            </label>
            <Input
              className="w-[100px] text-xs"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              placeholder="Category filter"
            />
          </div>
          {conversationsError && (
            <Card className="mb-2 border-status-danger text-[13px] text-status-danger">
              Could not load conversations: {conversationsError}{" "}
              <button onClick={refreshConversations} className={`${smallButtonClass} ml-1.5`}>
                Retry
              </button>
            </Card>
          )}
          {conversationsLoading && (
            <div className="space-y-2">
              <Skeleton className="h-[58px]" />
              <Skeleton className="h-[58px]" />
              <Skeleton className="h-[58px]" />
            </div>
          )}
          {!conversationsLoading && !conversationsError && conversations.length === 0 && filtersActive && (
            <Card className="text-[13px] text-text-secondary">
              No conversations match your filters.
              <div className="mt-1.5">
                <button onClick={clearConversationFilters} className={smallButtonClass}>
                  Clear filters
                </button>
              </div>
            </Card>
          )}
          {!conversationsLoading && !conversationsError && conversations.length === 0 && !filtersActive && (
            <Card className="text-[13px] text-text-secondary">
              <strong className="text-text-primary">No conversations yet</strong>
              <p className="mt-1.5">Connect your first account to start receiving messages.</p>
              <div className="mt-2.5">
                <Button onClick={onOpenConnectors}>Connect account</Button>
              </div>
            </Card>
          )}
          {!conversationsLoading &&
            conversations.map((c) => (
              <Card
                key={c.id}
                className={[
                  selectedId === c.id ? "border-accent-priority" : "",
                  c.unread ? "border-l-[3px] border-l-status-info bg-surface-2" : "",
                ].join(" ")}
              >
                <div onClick={() => selectConversation(c.id)} className="cursor-pointer">
                  <div className="flex items-center gap-1.5">
                    {c.unread && <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-status-info" />}
                    <span className={c.unread ? "font-bold text-text-primary" : "font-normal text-text-secondary"}>
                      {c.title ?? c.lastMessage?.sender?.displayName ?? "Unknown"}
                      {c.lastMessage?.sender?.isVip && " ⭐"}
                    </span>
                    <ProviderBadge providerKey={c.providerKey} />
                  </div>
                  <p className="mt-1 text-[13px] text-text-secondary">{c.lastMessage?.bodyText ?? ""}</p>
                  <p className="mt-1 text-[11px] text-text-disabled">
                    priority {c.priorityScore}
                    {c.category ? ` · ${c.category}` : ""}
                  </p>
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  <button onClick={() => handleToggleArchive(c)} className={smallButtonClass}>
                    {c.isArchived ? "Unarchive" : "Archive"}
                  </button>
                  {!c.unread && (
                    <button onClick={() => handleMarkUnread(c)} className={smallButtonClass}>
                      Mark unread
                    </button>
                  )}
                  <input
                    defaultValue={c.category ?? ""}
                    onBlur={(e) => handleSetCategory(c, e.target.value)}
                    placeholder="Set category"
                    className="h-6 flex-1 rounded-sm border border-border-subtle bg-surface-1 px-1 text-[11px] text-text-primary"
                  />
                </div>
              </Card>
            ))}
        </section>

        <section className={selectedId ? "block" : "hidden md:block"}>
          <button type="button" onClick={() => setSelectedId(null)} className={`${smallButtonClass} mb-2.5 inline-block md:hidden`}>
            ← Back to conversations
          </button>
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">Messages</h2>
          {!selectedId && <p className="text-[13px] text-text-secondary">Select a conversation to see its history.</p>}
          {selectedId && messages.length > 0 && (
            <div className="mb-2 flex gap-1.5">
              <button onClick={handleSummarize} disabled={summarizing} className={smallButtonClass}>
                {summarizing ? "Summarizing..." : "Summarize"}
              </button>
              <button onClick={handleSuggestReplies} disabled={suggestingReplies} className={smallButtonClass}>
                {suggestingReplies ? "Thinking..." : "Suggest replies"}
              </button>
            </div>
          )}
          {conversationSummary && (
            <Card className="border-status-info text-[13px]">
              <strong>AI summary:</strong> {conversationSummary}
            </Card>
          )}
          {replySuggestions.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {replySuggestions.map((r, i) => (
                <button key={i} onClick={() => setReplyText(r)} className={smallButtonClass}>
                  {r}
                </button>
              ))}
            </div>
          )}
          {messagesLoading && (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          )}
          {!messagesLoading &&
            messages.map((m) => (
              <Card key={m.id}>
                <strong className={m.direction === "outbound" ? "text-status-info" : "text-accent-priority"}>
                  {m.direction === "outbound" ? "Me" : (m.sender?.displayName ?? "Unknown")}
                </strong>{" "}
                <span className="text-xs text-text-secondary">{new Date(m.receivedAt).toLocaleTimeString()}</span>
                <p className="mt-1 text-text-secondary">{m.bodyText}</p>
              </Card>
            ))}
          {selectedId && (
            <div className="mt-2">
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !showScheduler && handleReply()}
                  placeholder="Reply..."
                />
                <Button onClick={handleReply} disabled={replying || scheduling || !replyText.trim()}>
                  {replying ? "Sending..." : "Reply"}
                </Button>
                <button onClick={() => setShowScheduler((v) => !v)} className={smallButtonClass} title="Schedule for later">
                  {showScheduler ? "Cancel schedule" : "Schedule"}
                </button>
              </div>
              {showScheduler && (
                <div className="mt-2 flex items-center gap-2">
                  <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                  <Button onClick={handleSchedule} disabled={scheduling || !replyText.trim() || !scheduleAt}>
                    {scheduling ? "Scheduling..." : "Confirm schedule"}
                  </Button>
                </div>
              )}
              {scheduledMessages.filter((s) => s.conversationId === selectedId && s.status === "pending").length > 0 && (
                <div className="mt-2">
                  <div className="mb-1 text-xs text-text-secondary">Scheduled:</div>
                  {scheduledMessages
                    .filter((s) => s.conversationId === selectedId && s.status === "pending")
                    .map((s) => (
                      <Card key={s.id} className="flex items-center justify-between text-[13px]">
                        <span>
                          <strong>{new Date(s.sendAt).toLocaleString()}</strong> - {s.bodyText}
                        </span>
                        <button onClick={() => handleCancelScheduled(s.id)} className={smallButtonClass}>
                          Cancel
                        </button>
                      </Card>
                    ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-text-secondary">Notifications</h2>
        {notifications.length === 0 && <p className="text-[13px] text-text-secondary">None yet.</p>}
        {notifications.map((n) => (
          <Card key={n.id}>
            <strong>{n.title}</strong>
            <p className="mt-1 text-[13px]">{n.body}</p>
          </Card>
        ))}
      </section>

      <div className="fixed right-4 top-4 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="min-w-[220px] rounded-lg bg-accent-priority p-3 text-[#1B2333] shadow-md">
            <strong>{t.title}</strong>
            <p className="mt-0.5 text-[13px]">{t.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
