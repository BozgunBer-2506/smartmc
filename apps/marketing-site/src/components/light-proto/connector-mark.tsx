import { cn } from "@/lib/utils";

/**
 * Restrained, non-branded per-connector indicator for the light prototype.
 * A soft tint (not a saturated brand color) gives quick visual recognition
 * without competing with Looktra orange or imitating each platform's logo.
 */
const TINTS: Record<string, string> = {
  Telegram: "bg-[#eaf4ff] text-[#2f6fb3] border-[#d2e8fb]",
  Discord: "bg-[#efedff] text-[#5b56c7] border-[#ddd9fb]",
  Slack: "bg-[#f6ecfb] text-[#9c4bc2] border-[#ecd9f6]",
  Email: "bg-[#f1f0ec] text-[#6b6358] border-[#e3ded3]",
};

export function ConnectorMark({ platform, className }: { platform: string; className?: string }) {
  const tint = TINTS[platform] ?? "bg-[var(--l-bg-soft)] text-[var(--l-muted)] border-[var(--l-border)]";
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[0.6875rem] font-semibold",
        tint,
        className,
      )}
    >
      {platform.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ConnectorChip({ platform }: { platform: string }) {
  const tint = TINTS[platform] ?? "bg-[var(--l-bg-soft)] text-[var(--l-muted)] border-[var(--l-border)]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
        tint,
      )}
    >
      <ConnectorMark platform={platform} className="h-4 w-4 border-0 bg-transparent p-0 text-[0.5625rem]" />
      {platform}
    </span>
  );
}
