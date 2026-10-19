import { ChannelTile } from "./connector";
import { cn } from "@/lib/utils";

/**
 * A piece of a real conversation entering the system — not a marketing
 * card. Deliberately plain: white surface, one hairline border, no
 * decorative framing, so it reads as "a message" rather than "a feature".
 */
export function MessageFragment({
  name,
  platform,
  preview,
  time,
  className,
}: {
  name: string;
  platform: string;
  preview: string;
  time: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-[260px] items-start gap-3 rounded-xl border border-[#e8e5e1] bg-[var(--v3-surface)] p-3.5 shadow-[0_10px_22px_-18px_rgba(12,11,10,0.16)]",
        className,
      )}
    >
      <ChannelTile platform={platform} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[0.8125rem] font-semibold text-[var(--v3-ink)]">{name}</p>
          <span className="shrink-0 text-[0.625rem] text-[var(--v3-faint)]">{time}</span>
        </div>
        <p className="mt-0.5 text-[0.8125rem] leading-snug text-[var(--v3-muted)]">{preview}</p>
      </div>
    </div>
  );
}
