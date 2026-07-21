import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

/**
 * Every section hangs off the page spine: one hairline running top to bottom
 * with a node where each section starts. The spine is the structural device
 * of this site and it encodes the product itself, an ordered event stream.
 */
export function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
  className,
  aside,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede?: string;
  children?: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <section id={id} className={cn("relative scroll-mt-24 border-t border-line", className)}>
      <div className="container">
        <div className="relative py-20 lg:py-28 lg:pl-16">
          <span className="spine" aria-hidden />
          <span className="spine-node top-[6px]" aria-hidden>
            <span className="h-[5px] w-[5px] rounded-full bg-line-strong" />
          </span>

          <Reveal>
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-eyebrow uppercase text-faint">{eyebrow}</p>
              {aside}
            </div>
            <h2 className="mt-5 max-w-3xl font-display text-title text-paper">{title}</h2>
            {lede ? (
              <p className="mt-5 max-w-2xl text-[1.0625rem] leading-relaxed text-muted">{lede}</p>
            ) : null}
          </Reveal>

          {children ? <div className="mt-14">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
