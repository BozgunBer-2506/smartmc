import { ConnectorMark } from "./connector-mark";
import { inbox } from "@/content/site";
import { cn } from "@/lib/utils";

/** Light-theme product preview. Mirrors the dark InboxPreview's content and
 * structure (same example threads/conversation from content/site.ts) so the
 * two visual directions stay a fair, like-for-like comparison. */
export function LightInboxPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--l-border)] bg-[var(--l-surface)] shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_24px_60px_-36px_rgba(20,17,15,0.25)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--l-border)] px-4 py-3 sm:px-5">
        <p className="text-sm font-semibold text-[var(--l-ink)]">One inbox</p>
        <span className="rounded-full bg-[var(--l-bg-soft)] px-2 py-0.5 text-[0.6875rem] text-[var(--l-faint)]">
          Product preview
        </span>
      </div>
      <div className={cn(!compact && "grid md:grid-cols-[minmax(0,320px)_1fr]")}>
        <ul
          className={cn(
            "divide-y divide-[var(--l-border)]",
            !compact && "border-b border-[var(--l-border)] md:border-b-0 md:border-r",
          )}
        >
          {inbox.threads.map((thread, index) => (
            <li
              key={thread.platform}
              className={cn(
                "flex gap-3 px-4 sm:px-5",
                compact ? "py-3" : "py-4",
                index === 0 && "bg-[var(--l-orange-soft)]",
              )}
            >
              <ConnectorMark platform={thread.platform} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-medium text-[var(--l-ink)]">{thread.name}</p>
                  <span className="shrink-0 text-[0.6875rem] text-[var(--l-faint)]">{thread.time}</span>
                </div>
                <p className="mt-1 truncate text-xs text-[var(--l-muted)]">{thread.preview}</p>
                <p className="mt-1 text-[0.6875rem] text-[var(--l-faint)]">{thread.platform}</p>
              </div>
              {thread.unread && (
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--l-orange)]"
                  aria-label="Unread"
                />
              )}
            </li>
          ))}
        </ul>
        {!compact && (
          <div className="flex flex-col">
            <div className="border-b border-[var(--l-border)] px-6 py-5">
              <p className="font-display text-base font-medium text-[var(--l-ink)]">{inbox.conversation.name}</p>
              <p className="mt-1 text-xs text-[var(--l-muted)]">Conversation on {inbox.conversation.platform}</p>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-5 p-6 sm:p-8">
              {inbox.conversation.messages.map((message) => (
                <div
                  key={message.sender}
                  className={cn(
                    "max-w-[85%] rounded-2xl border p-4",
                    message.sender === "you"
                      ? "ml-auto border-[var(--l-orange-border)] bg-[var(--l-orange-soft)]"
                      : "border-[var(--l-border)] bg-[var(--l-bg-soft)]",
                  )}
                >
                  <p className="mb-2 text-xs text-[var(--l-faint)]">
                    {message.sender === "you" ? "You" : message.sender}
                  </p>
                  <p className="text-sm leading-relaxed text-[var(--l-ink)]">{message.text}</p>
                </div>
              ))}
            </div>
            <p className="border-t border-[var(--l-border)] px-6 py-4 text-xs leading-relaxed text-[var(--l-faint)]">
              {inbox.note}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
