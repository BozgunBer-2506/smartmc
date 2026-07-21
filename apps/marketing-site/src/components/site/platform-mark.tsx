import { cn } from "@/lib/utils";

/**
 * Neutral monogram tiles instead of third party brand logos.
 * Keeps colour reserved for status and avoids shipping other companies' marks.
 */
export function PlatformMark({
  platform,
  className,
}: {
  platform: string;
  className?: string;
}) {
  const letter = platform.slice(0, 1).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line-strong bg-raised font-mono text-[0.6875rem] text-muted",
        className,
      )}
    >
      {letter}
    </span>
  );
}
