import { cn } from "@/lib/utils";

/**
 * Per-channel identity, now recognizable without reading the label per the
 * composition-correction brief. These are hand-drawn generic pictograms in
 * each platform's color family (paper plane / grouped dots / chat bubble /
 * envelope), not traced copies of any trademarked logo artwork — same
 * no-third-party-logo policy as components/site/platform-mark.tsx on the
 * dark baseline, just recognizable by shape+color instead of by a letter.
 */
const TINT: Record<string, { bg: string; fg: string }> = {
  Telegram: { bg: "#e8f2fc", fg: "#2f9fe0" },
  Discord: { bg: "#ecebfc", fg: "#5b56c7" },
  Slack: { bg: "#f6f5f2", fg: "#4a4540" },
  Email: { bg: "#f0efec", fg: "#716b60" },
  WhatsApp: { bg: "#eaf7ee", fg: "#3fa35a" },
};

function Glyph({ platform }: { platform: string }) {
  switch (platform) {
    case "Telegram":
      return (
        <svg viewBox="0 0 20 20" fill="none" className="h-[60%] w-[60%]">
          <path d="M2.5 10.4 16.8 4.3c.7-.3 1.4.3 1.1 1.1l-2.6 11.4c-.2.8-1 .9-1.6.5l-3.6-2.7-1.9 1.9c-.3.3-.6.2-.7-.2l-.5-3.4-4.1-1.5c-.7-.2-.7-1.1.1-1.3Z" fill="currentColor" />
        </svg>
      );
    case "Discord":
      return (
        <svg viewBox="0 0 20 20" fill="none" className="h-[62%] w-[62%]">
          <path
            d="M15.3 5.4a12 12 0 0 0-2.9-.9l-.2.4c1 .2 1.9.6 2.7 1.1a9.8 9.8 0 0 0-10 0c.8-.5 1.7-.9 2.7-1.1l-.2-.4a12 12 0 0 0-2.9.9C2.6 8 2 10.6 2.2 13.1c1.2.9 2.3 1.4 3.4 1.8l.4-.9c-.6-.2-1.2-.5-1.7-.9.1-.1.3-.2.4-.3a8.7 8.7 0 0 0 7.3 0c.1.1.3.2.4.3-.5.4-1.1.7-1.7.9l.4.9c1.1-.3 2.2-.9 3.4-1.8.3-2.9-.5-5.5-2.2-7.7ZM7.4 11.7c-.6 0-1.1-.6-1.1-1.3s.5-1.3 1.1-1.3c.6 0 1.1.6 1.1 1.3s-.5 1.3-1.1 1.3Zm5.2 0c-.6 0-1.1-.6-1.1-1.3s.5-1.3 1.1-1.3c.6 0 1.1.6 1.1 1.3s-.5 1.3-1.1 1.3Z"
            fill="currentColor"
          />
        </svg>
      );
    case "Slack":
      return (
        <svg viewBox="0 0 20 20" fill="none" className="h-[62%] w-[62%]">
          <rect x="2.5" y="2.5" width="6" height="6" rx="1.6" fill="#36C5F0" />
          <rect x="11.5" y="2.5" width="6" height="6" rx="1.6" fill="#2EB67D" />
          <rect x="2.5" y="11.5" width="6" height="6" rx="1.6" fill="#ECB22E" />
          <rect x="11.5" y="11.5" width="6" height="6" rx="1.6" fill="#E01E5A" />
        </svg>
      );
    case "Email":
      return (
        <svg viewBox="0 0 20 20" fill="none" className="h-[58%] w-[58%]">
          <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3 5.5 10 11l7-5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "WhatsApp":
      return (
        <svg viewBox="0 0 20 20" fill="none" className="h-[58%] w-[58%]">
          <path
            d="M10 2.5a7.5 7.5 0 0 0-6.4 11.4L2.5 17.5l3.7-1a7.5 7.5 0 1 0 3.8-14Z"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M7.3 7.2c.2-.4.4-.4.6-.4h.4c.2 0 .4 0 .5.4.2.4.6 1.3.6 1.4.1.1.1.3 0 .4-.1.2-.2.3-.3.4-.1.1-.3.3-.1.6.2.3.8 1.2 1.7 1.9 1.1.9 1.5 1 1.8.9.2-.1.6-.6.8-.9.2-.2.4-.2.6-.1l1.3.6c.2.1.4.2.4.4.1.2.1 1-.3 1.4-.3.5-1.3.9-2.2.7-.9-.1-2.7-.9-4-2.4-1.4-1.6-2-2.7-2.2-3.4-.3-.6-.1-1 .1-1.4Z"
            fill="currentColor"
          />
        </svg>
      );
    default:
      return null;
  }
}

export function ChannelTile({ platform, className }: { platform: string; className?: string }) {
  const tint = TINT[platform] ?? { bg: "#f0efec", fg: "#716b60" };
  return (
    <span
      aria-hidden
      className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", className)}
      style={{ background: tint.bg, color: tint.fg }}
    >
      <Glyph platform={platform} />
    </span>
  );
}

export function ChannelLabel({ platform, className }: { platform: string; className?: string }) {
  const tint = TINT[platform] ?? { bg: "#f0efec", fg: "#716b60" };
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="inline-block h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: tint.fg }} />
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
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--v3-ink)] text-xs font-semibold text-white",
        className,
      )}
    >
      {initial}
    </span>
  );
}
