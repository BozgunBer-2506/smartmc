import { inbox } from "@/content/site";
import { SectionHeading } from "./section-heading";
import { ProductShell } from "./product-shell";

/**
 * Different emphasis than the hero: the hero establishes the proposition
 * with the Telegram thread open; this section switches to a different
 * connected service to demonstrate that source context follows the
 * conversation rather than repeating the same screenshot.
 */
export function LightV2Inbox() {
  const switchedIndex = 2; // Slack thread — a different source than the hero's
  const switched = inbox.threads[switchedIndex];

  return (
    <section id="unified-inbox" className="border-t border-[var(--v2-line)] py-20 sm:py-28">
      <div className="mx-auto max-w-[1240px] px-6 lg:px-8">
        <SectionHeading eyebrow={inbox.eyebrow} title={inbox.title} lede={inbox.lede} />
        <p className="mt-8 text-sm text-[var(--v2-faint)]">
          Still the same inbox. Now open on <span className="font-medium text-[var(--v2-ink)]">{switched.platform}</span>.
        </p>
      </div>
      <div className="mx-auto mt-5 max-w-[1320px] px-3 sm:px-6 lg:px-4">
        <ProductShell selectedIndex={switchedIndex} />
      </div>
    </section>
  );
}
