import { ChannelLabel } from "./connector";
import { conversation, identityPreviews } from "./content";

const telegramMessages = conversation.messages
  .slice()
  .reverse()
  .map((m) => ({
    who: m.sender === "you" ? "You" : "Daniel",
    text: m.text,
    time: m.sender === "you" ? "10:15" : "10:14",
  }));

const emailEntry = {
  who: "Daniel",
  text: identityPreviews[1],
  time: "14:42",
};

/**
 * Chapter 3: "Keep the conversation. Not the app." One real Looktra
 * surface — Daniel's context — as a continuous timeline, not a second
 * diagram and not a grid of cards. Reuses the exact Telegram exchange from
 * the hero and the exact Email line resolved in Identity, so this chapter
 * reads as the payoff of connecting those accounts rather than a new demo.
 */
export function LightV3Context() {
  return (
    <section id="context" className="relative">
      <div className="mx-auto max-w-[1320px] px-6 pb-24 pt-6 sm:pb-28 lg:px-10 lg:pb-32">
        <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:gap-20">
          {/* Copy — first in source order so mobile shows it before the
              product surface; moved to the right column on desktop. */}
          <div className="order-1 lg:order-2">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--v3-orange)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--v3-orange)]" aria-hidden />
              Context, not channels
            </p>
            <h2 className="mt-4 font-display text-[clamp(2.25rem,4.4vw,3.25rem)] font-semibold leading-[1.08] tracking-tight text-[var(--v3-ink)]">
              Keep the conversation.
              <br />
              <span className="text-[var(--v3-orange)]">Not the app.</span>
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--v3-muted)] sm:text-lg">
              Plans change between messages, emails and apps. Looktra keeps the conversation connected to the person,
              so the context stays with you.
            </p>
          </div>

          {/* One product surface: Daniel's context as a continuous
              timeline. Provenance (Telegram / Email) stays visible per
              entry but stays secondary to the conversation itself. */}
          <div className="order-2 w-full max-w-[560px] overflow-hidden rounded-2xl border border-[var(--v3-line)] bg-[var(--v3-surface)] shadow-[0_30px_70px_-32px_rgba(12,11,10,0.22)] lg:order-1 lg:mr-auto lg:max-w-[580px]">
            <div className="border-b border-[var(--v3-line)] px-6 py-5">
              <p className="font-display text-base font-semibold text-[var(--v3-ink)]">Daniel K.</p>
              <p className="text-xs text-[var(--v3-faint)]">Context · 2 connected accounts</p>
            </div>

            <div className="px-7 py-7 sm:px-8 sm:py-8">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--v3-faint)]">Today</p>

              <div className="mt-5">
                <p className="text-xs">
                  <ChannelLabel platform="Telegram" />
                </p>
                <div className="mt-3 space-y-5">
                  {telegramMessages.map((m) => (
                    <div key={m.time + m.who}>
                      <p className="text-sm font-medium text-[var(--v3-muted)]">
                        {m.who} <span className="font-normal text-[var(--v3-faint)]">— {m.time}</span>
                      </p>
                      <p className="mt-1 text-base leading-relaxed text-[var(--v3-ink)]">{m.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="my-6 text-xs text-[var(--v3-faint)]">Later that day</p>

              <div>
                <p className="text-xs">
                  <ChannelLabel platform="Email" />
                </p>
                <div className="mt-3">
                  <p className="text-sm font-medium text-[var(--v3-muted)]">
                    {emailEntry.who} <span className="font-normal text-[var(--v3-faint)]">— {emailEntry.time}</span>
                  </p>
                  <p className="mt-1 text-base leading-relaxed text-[var(--v3-ink)]">{emailEntry.text}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
