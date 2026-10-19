import Image from "next/image";
import { hero, inbox } from "@/content/site";
import { MessageFragment } from "./message-fragment";
import { ConnectionPaths } from "./connection-paths";
import { ProductPanel } from "./product-panel";
import { ChannelTile } from "./connector";

const CONNECTED = ["Telegram", "Slack", "Discord", "Email"];

export function LightV3Hero() {
  const [t1, t2, t3, t4] = inbox.threads;

  return (
    <section id="top" className="relative overflow-hidden">
      {/* Restrained warm background energy behind the product — not a loud
          gradient blob, just enough to anchor the composition. */}
      <div
        className="pointer-events-none absolute -right-[10%] top-[6%] hidden h-[640px] w-[900px] rounded-full opacity-60 blur-3xl lg:block"
        style={{ background: "radial-gradient(closest-side, rgba(251,86,39,0.14), rgba(251,86,39,0) 70%)" }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1320px] px-6 pt-8 sm:pt-10 lg:px-10 lg:pt-10">
        {/* Text block — shown normally below xl; shown again, identical
            content, absolutely positioned at xl+ so it can share vertical
            rows with the product panel instead of sitting in its own row
            above it. */}
        <div className="max-w-xl xl:hidden">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--v3-orange)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--v3-orange)]" aria-hidden />
            Messages, people, context
          </p>
          <h1 className="mt-4 font-display text-[clamp(2.5rem,5.2vw,3.75rem)] font-semibold leading-[1.04] tracking-tight text-[var(--v3-ink)]">
            Messages from different apps.
            <br />
            <span className="text-[var(--v3-orange)]">One inbox.</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-[var(--v3-muted)] sm:text-lg">{hero.lede}</p>
          <div className="mt-6 flex flex-wrap items-center gap-5">
            <a
              href={hero.primaryCta.href}
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-[var(--v3-orange-button)] px-6 text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--v3-orange-button-hover)]"
            >
              {hero.primaryCta.label}
              <span aria-hidden>→</span>
            </a>
            <a
              href="#context"
              className="inline-flex h-12 items-center gap-1.5 text-sm font-medium text-[var(--v3-muted)] underline decoration-[var(--v3-line-strong)] underline-offset-4 transition-colors hover:text-[var(--v3-ink)]"
            >
              {hero.secondaryCta.label}
              <span aria-hidden>↓</span>
            </a>
          </div>
        </div>

        {/* Desktop composition: one unified, overlapping scene. The product
            panel shares vertical space with the headline instead of sitting
            below it, and dominates the right side of the viewport. */}
        <div className="relative mt-6 hidden xl:block" style={{ height: 800 }}>
          <div className="absolute left-0 top-0 max-w-[440px]">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--v3-orange)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--v3-orange)]" aria-hidden />
              Messages, people, context
            </p>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,5.2vw,3.75rem)] font-semibold leading-[1.04] tracking-tight text-[var(--v3-ink)]">
              Messages from different apps.
              <br />
              <span className="text-[var(--v3-orange)]">One inbox.</span>
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-[var(--v3-muted)] sm:text-lg">{hero.lede}</p>
            <div className="mt-6 flex flex-wrap items-center gap-5">
              <a
                href={hero.primaryCta.href}
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-[var(--v3-orange-button)] px-6 text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--v3-orange-button-hover)]"
              >
                {hero.primaryCta.label}
                <span aria-hidden>→</span>
              </a>
              <a
                href="#context"
                className="inline-flex h-12 items-center gap-1.5 text-sm font-medium text-[var(--v3-muted)] underline decoration-[var(--v3-line-strong)] underline-offset-4 transition-colors hover:text-[var(--v3-ink)]"
              >
                {hero.secondaryCta.label}
                <span aria-hidden>↓</span>
              </a>
            </div>
          </div>

          <ConnectionPaths className="absolute left-0 top-0 h-[820px] w-[1240px]" />

          <MessageFragment {...t1} className="absolute left-0 top-[372px] w-[205px]" />
          <MessageFragment {...t2} className="absolute left-[88px] top-[452px] w-[245px]" />
          <MessageFragment {...t3} className="absolute left-[4px] top-[566px] w-[200px]" />
          <MessageFragment {...t4} className="absolute left-[108px] top-[648px] w-[228px]" />

          <Image
            src="/looktra-symbol.png"
            alt=""
            width={58}
            height={28}
            className="absolute left-[460px] top-[519px] z-10"
          />

          <div className="absolute left-[560px] top-[70px]">
            <ProductPanel />
          </div>
        </div>

        {/* Mobile / tablet composition: a short, deliberate stack — not a
            shrunk desktop scene. */}
        <div className="mt-12 xl:hidden">
          <div className="flex flex-col gap-2.5">
            {[t1, t2].map((t) => (
              <MessageFragment key={t.platform} {...t} className="w-full sm:w-[320px]" />
            ))}
          </div>
          <div className="my-4 flex items-center gap-2 pl-1 text-[var(--v3-orange)]">
            <span className="h-px w-8 bg-[var(--v3-orange)]" aria-hidden />
            <Image src="/looktra-symbol.png" alt="" width={32} height={15} />
            <span className="h-px flex-1 bg-[var(--v3-orange)]" aria-hidden />
          </div>
          <div className="overflow-hidden rounded-2xl border border-[var(--v3-line)] bg-[var(--v3-surface)] shadow-[0_20px_50px_-24px_rgba(12,11,10,0.25)]">
            <div className="flex items-center justify-between border-b border-[var(--v3-line)] px-4 py-3.5">
              <p className="font-display text-sm font-semibold text-[var(--v3-ink)]">Inbox</p>
              <span className="text-xs text-[var(--v3-faint)]">{inbox.threads.filter((t) => t.unread).length} unread</span>
            </div>
            <ul className="divide-y divide-[var(--v3-line)]">
              {inbox.threads.map((t, i) => (
                <li key={t.platform} className={i === 0 ? "flex gap-3 bg-[var(--v3-orange-wash)] px-4 py-3" : "flex gap-3 px-4 py-3"}>
                  <ChannelTile platform={t.platform} className="h-7 w-7" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-[var(--v3-ink)]">{t.name}</p>
                      <span className="shrink-0 text-[0.6875rem] text-[var(--v3-faint)]">{t.time}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[var(--v3-muted)]">{t.preview}</p>
                  </div>
                  {t.unread && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--v3-orange)]" />}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Connector story: live connectors, plus WhatsApp clearly marked as
            not yet available — smallest treatment, no card/pill of its own,
            and never inside the inbox preview above. */}
        <div className="mt-10 border-t border-[var(--v3-line)] py-6 xl:mt-8">
          <p className="text-center text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[var(--v3-faint)]">
            Works with your connected accounts
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {CONNECTED.map((platform) => (
              <span key={platform} className="inline-flex items-center gap-2 text-sm text-[var(--v3-muted)]">
                <ChannelTile platform={platform} className="h-6 w-6 text-[0.625rem]" />
                {platform}
              </span>
            ))}
            <span className="inline-flex items-center gap-2 text-sm text-[var(--v3-faint)]">
              <ChannelTile platform="WhatsApp" className="h-6 w-6 text-[0.625rem] opacity-60" />
              WhatsApp
              <span className="rounded-full border border-[var(--v3-line-strong)] px-2 py-0.5 text-[0.625rem] font-medium text-[var(--v3-faint)]">
                Coming soon
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
