import Image from "next/image";
import { inbox } from "@/content/light-prototypes";
import { ChannelLabel, Avatar } from "./connector";
import { cn } from "@/lib/utils";

const RAIL_CHANNELS = ["Telegram", "Email", "Slack", "Discord"];

/**
 * The product itself as the hero object: a small real-looking app shell
 * (icon rail + conversation list + open conversation), not a marketing card
 * containing fake rows. Reused across hero and the inbox section with a
 * different selected thread so each section shows something the other
 * didn't.
 */
export function ProductShell({
  selectedIndex = 0,
  className,
}: {
  selectedIndex?: number;
  className?: string;
}) {
  const selected = inbox.threads[selectedIndex];
  const isPrimaryThread = selected.platform === inbox.conversation.platform && selected.name === inbox.conversation.name;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--v2-line)] bg-[var(--v2-bg)] shadow-[0_24px_60px_-28px_rgba(12,11,10,0.18)]",
        className,
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-[56px_minmax(0,280px)_minmax(0,1fr)]">
        {/* Icon rail */}
        <div className="hidden flex-col items-center gap-4 border-r border-[var(--v2-line)] bg-[var(--v2-rail)] py-5 md:flex">
          <Image src="/looktra-symbol.png" alt="" width={22} height={11} className="mb-1" />
          {RAIL_CHANNELS.map((platform) => (
            <span
              key={platform}
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[0.625rem] font-semibold text-[var(--v2-muted)] hover:bg-white"
              title={platform}
            >
              {platform.slice(0, 1)}
            </span>
          ))}
        </div>

        {/* Conversation list */}
        <ul className="divide-y divide-[var(--v2-line)] border-[var(--v2-line)] md:border-r">
          {inbox.threads.map((thread, index) => {
            const active = index === selectedIndex;
            return (
              <li
                key={thread.platform}
                className={cn(
                  "relative flex gap-3 px-4 py-3.5",
                  active && "bg-[var(--v2-orange-wash)]",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-0 h-full w-[3px] bg-[var(--v2-orange)]" aria-hidden />
                )}
                <Avatar name={thread.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-[var(--v2-ink)]">{thread.name}</p>
                    <span className="shrink-0 text-[0.6875rem] text-[var(--v2-faint)]">{thread.time}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[var(--v2-muted)]">{thread.preview}</p>
                  <p className="mt-1 text-[0.6875rem]">
                    <ChannelLabel platform={thread.platform} />
                  </p>
                </div>
                {thread.unread && (
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--v2-orange)]" aria-label="Unread" />
                )}
              </li>
            );
          })}
        </ul>

        {/* Open conversation */}
        <div className="hidden flex-col md:flex">
          <div className="flex items-center gap-3 border-b border-[var(--v2-line)] px-6 py-4">
            <Avatar name={selected.name} />
            <div>
              <p className="text-sm font-semibold text-[var(--v2-ink)]">{selected.name}</p>
              <p className="text-xs">
                <ChannelLabel platform={selected.platform} />
              </p>
            </div>
          </div>
          <div className="flex min-h-[320px] flex-1 flex-col justify-center gap-4 px-6 py-8 sm:px-8">
            {isPrimaryThread ? (
              inbox.conversation.messages.map((message) => (
                <div
                  key={message.sender}
                  className={cn("max-w-[80%]", message.sender === "you" ? "ml-auto text-right" : "")}
                >
                  <p
                    className={cn(
                      "inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      message.sender === "you"
                        ? "bg-[var(--v2-orange-wash-strong)] text-[var(--v2-ink)]"
                        : "bg-[var(--v2-surface-soft)] text-[var(--v2-ink)]",
                    )}
                  >
                    {message.text}
                  </p>
                </div>
              ))
            ) : (
              <div className="max-w-[80%]">
                <p className="inline-block rounded-2xl bg-[var(--v2-surface-soft)] px-4 py-2.5 text-sm leading-relaxed text-[var(--v2-ink)]">
                  {selected.preview}
                </p>
              </div>
            )}
          </div>
          <p className="border-t border-[var(--v2-line)] px-6 py-3 text-[0.6875rem] text-[var(--v2-faint)]">
            {inbox.note}
          </p>
        </div>
      </div>
    </div>
  );
}
