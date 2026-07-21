import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Every future product screenshot on this site goes through this frame.
 *
 * Rules it enforces:
 *  - Fixed 16:9 aspect ratio. The layout is sized around this today, so a real
 *    capture six months from now drops in with zero layout shift.
 *  - One consistent chrome (border, radius, shadow) for every product image.
 *  - Until `src` is provided, the `fallback` renders inside the same box, so
 *    placeholder and real image occupy identical space.
 *
 * Swapping in a real screenshot is a one-line change at the call site:
 *   <ScreenshotFrame src="/screens/inbox.png" alt="Unified inbox" />
 *
 * Capture real screenshots at 1600x900 (or any exact 16:9) on the dark theme.
 */
export function ScreenshotFrame({
  src,
  alt,
  fallback,
  label,
  className,
}: {
  src?: string;
  alt?: string;
  fallback?: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <figure className={cn("overflow-hidden rounded-card border border-line bg-raised", className)}>
      <div className="relative aspect-video w-full">
        {src ? (
          <Image src={src} alt={alt ?? ""} fill sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover object-top" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8">
            {fallback}
            {label ? (
              <figcaption className="font-mono text-[0.6875rem] text-faint">{label}</figcaption>
            ) : null}
          </div>
        )}
      </div>
    </figure>
  );
}
