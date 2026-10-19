import Image from "next/image";
import { inbox } from "@/content/site";
import { ChannelTile, ChannelLabel, Avatar } from "./connector";
import { conversation } from "./content";
import { cn } from "@/lib/utils";

const RAIL_ITEMS = [
  { label: "Inbox", count: inbox.threads.length, active: true },
  { label: "People", count: null, active: false },
];

const CONNECTED = ["Telegram", "Slack", "Discord", "Email"];

/**
 * The real product as one layered surface: a main app window (sidebar +
 * conversation list) with the open conversation as a second surface
 * stepped forward in front of it — matching the reference's depth, not a
 * single flat 3-column box.
 */
export function ProductPanel({ className }: { className?: string }) {
  const selected = inbox.threads[0];

  return (
    <div className={cn("relative w-[640px]", className)}>
      {/* Main app window: sidebar + conversation list */}
      <div className="grid grid-cols-[210px_430px] overflow-hidden rounded-2xl border border-[var(--v3-line)] bg-[var(--v3-surface)] shadow-[0_34px_80px_-30px_rgba(12,11,10,0.24)]">
        <div className="flex flex-col gap-6 border-r border-[var(--v3-line)] bg-[var(--v3-rail)] px-5 py-5">
          <Image src="/looktra-symbol.png" alt="" width={30} height={15} />
          <nav className="flex flex-col gap-1">
            {RAIL_ITEMS.map((item) => (
              <span
                key={item.label}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium",
                  item.active ? "bg-[var(--v3-orange-wash-strong)] text-[var(--v3-orange-strong)]" : "text-[var(--v3-muted)]",
                )}
              >
                {item.label}
                {item.count !== null && (
                  <span className="rounded-full bg-[var(--v3-orange)] px-1.5 text-[0.625rem] font-semibold text-white">
                    {item.count}
                  </span>
                )}
              </span>
            ))}
          </nav>
          <div>
            <p className="px-2.5 text-[0.625rem] font-semibold uppercase tracking-wider text-[var(--v3-faint)]">
              Connected
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {CONNECTED.map((platform) => (
                <li key={platform} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5">
                  <ChannelTile platform={platform} className="h-6 w-6" />
                  <span className="text-sm text-[var(--v3-muted)]">{platform}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b border-[var(--v3-line)] px-6 py-4">
            <p className="font-display text-lg font-semibold text-[var(--v3-ink)]">Inbox</p>
            <span className="text-xs text-[var(--v3-faint)]">{inbox.threads.filter((t) => t.unread).length} unread</span>
          </div>
          <ul className="divide-y divide-[var(--v3-line)]">
            {inbox.threads.map((thread, i) => (
              <li key={thread.platform} className={cn("flex gap-3.5 px-6 py-4", i === 0 && "bg-[var(--v3-orange-wash)]")}>
                <Avatar name={thread.name} className="h-10 w-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-[var(--v3-ink)]">{thread.name}</p>
                    <span className="shrink-0 text-xs text-[var(--v3-faint)]">{thread.time}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[0.8125rem] text-[var(--v3-muted)]">{thread.preview}</p>
                  <p className="mt-1.5 text-xs">
                    <ChannelLabel platform={thread.platform} />
                  </p>
                </div>
                {thread.unread && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--v3-orange)]" />}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Open conversation — stepped forward and genuinely overlapping the
          main window's top-right corner, so it reads as the same product
          seen from two angles rather than an unrelated floating modal. */}
      <div className="absolute -right-20 -top-8 flex w-[350px] flex-col overflow-hidden rounded-2xl border border-[var(--v3-line)] bg-[var(--v3-surface)] shadow-[0_44px_84px_-26px_rgba(12,11,10,0.3)]">
        <div className="flex items-center gap-3 border-b border-[var(--v3-line)] px-5 py-4">
          <Avatar name={selected.name} className="h-9 w-9 text-xs" />
          <div>
            <p className="text-sm font-semibold text-[var(--v3-ink)]">{selected.name}</p>
            <p className="text-xs">
              <ChannelLabel platform={selected.platform} />
            </p>
          </div>
        </div>
        <div className="flex min-h-[190px] flex-col justify-end gap-2.5 px-4 py-5">
          {conversation.messages
            .slice()
            .reverse()
            .map((message) => (
              <div key={message.sender} className={cn("max-w-[85%]", message.sender === "you" ? "ml-auto" : "")}>
                <p
                  className={cn(
                    "inline-block rounded-xl px-4 py-2.5 text-sm leading-relaxed",
                    message.sender === "you"
                      ? "bg-[var(--v3-orange-wash-strong)] text-[var(--v3-ink)]"
                      : "bg-[var(--v3-rail)] text-[var(--v3-ink)]",
                  )}
                >
                  {message.text}
                </p>
              </div>
            ))}
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--v3-line)] px-5 py-3.5">
          <span className="flex-1 text-sm text-[var(--v3-faint)]">Write a message…</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--v3-orange)] text-white" aria-hidden>
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
              <path d="M1 6h9M6 1l5 5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
