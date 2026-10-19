import { cn } from "@/lib/utils";

/**
 * Restrained per-channel identity: a tiny accent dot + label used inline
 * next to an avatar/name, never a standalone colored pill. Colors are a
 * quiet identification cue, not decoration — Looktra orange stays the only
 * loud color on the page.
 */
const DOT: Record<string, string> = {
  Telegram: "#3b8fd4",
  Discord: "#6b63e0",
  Slack: "#a24bc9",
  Email: "#8a857c",
};

export function ChannelDot({ platform, className }: { platform: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-[6px] w-[6px] shrink-0 rounded-full", className)}
      style={{ background: DOT[platform] ?? "#8a857c" }}
    />
  );
}

export function ChannelLabel({ platform }: { platform: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--v2-faint)]">
      <ChannelDot platform={platform} />
      {platform}
    </span>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initial = name.trim().slice(0, 1).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--v2-ink)] text-xs font-semibold text-white",
        className,
      )}
    >
      {initial}
    </span>
  );
}
