import { Section } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { PlatformMark } from "@/components/site/platform-mark";
import { ScreenshotFrame } from "@/components/site/screenshot-frame";
import { inbox } from "@/content/site";
import { cn } from "@/lib/utils";

/**
 * Memorability rule for this section: the thread list on the left is built in
 * code and stays even after real screenshots arrive. It IS the "one queue,
 * every platform" idea, readable without any image. Only the right pane is a
 * screenshot slot.
 */
export function UnifiedInbox() {
  return (
    <Section id="unified-inbox" eyebrow={inbox.eyebrow} title={inbox.title} lede={inbox.lede}>
      <Reveal>
        <div className="overflow-hidden rounded-panel border border-line bg-panel shadow-lift">
          {/* window chrome */}
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-2 w-2 rounded-full bg-line-strong" />
                <span className="h-2 w-2 rounded-full bg-line-strong" />
                <span className="h-2 w-2 rounded-full bg-line-strong" />
              </span>
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-faint">
                Inbox / All platforms
              </p>
            </div>
            <p className="flex items-center gap-2 font-mono text-[0.6875rem] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden />
              connected
            </p>
          </div>

          <div className="grid md:grid-cols-[minmax(0,320px)_1fr]">
            {/* thread list: permanent, code-drawn, carries the section's idea */}
            <ul className="divide-y divide-line border-b border-line md:border-b-0 md:border-r">
              {inbox.threads.map((t) => (
                <li
                  key={t.name + t.time}
                  className={cn(
                    "flex gap-3 px-5 py-4 transition-colors",
                    t.unread ? "bg-raised/60" : "hover:bg-raised/40",
                  )}
                >
                  <PlatformMark platform={t.platform} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium text-paper">{t.name}</p>
                      <span className="shrink-0 font-mono text-[0.6875rem] text-faint">{t.time}</span>
                    </div>
                    <p className="mt-1 truncate text-[0.8125rem] text-muted">{t.preview}</p>
                    <p className="mt-1.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-faint">
                      {t.platform}
                    </p>
                  </div>
                  {t.unread ? (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" aria-label="Unread" />
                  ) : null}
                </li>
              ))}
            </ul>

            {/* screenshot slot: pass src here when the real capture exists */}
            <div className="p-4 sm:p-6">
              <ScreenshotFrame
                label={inbox.note}
                className="h-full border-0 bg-transparent"
                fallback={
                  <div className="w-full max-w-sm space-y-3" aria-hidden>
                    <div className="h-2.5 w-2/3 rounded-full bg-line" />
                    <div className="h-2.5 w-full rounded-full bg-line" />
                    <div className="h-2.5 w-4/5 rounded-full bg-line" />
                    <div className="ml-auto h-2.5 w-1/2 rounded-full bg-line-strong" />
                    <div className="ml-auto h-2.5 w-2/5 rounded-full bg-line-strong" />
                  </div>
                }
              />
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
