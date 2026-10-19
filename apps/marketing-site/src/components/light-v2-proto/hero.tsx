import { ArrowRight } from "lucide-react";
import { hero } from "@/content/site";
import { ProductShell } from "./product-shell";
import { ChannelDot } from "./connector";

export function LightV2Hero() {
  return (
    <section id="top" className="relative">
      <div className="mx-auto max-w-[1240px] px-6 pt-12 sm:pt-16 lg:px-8 lg:pt-20">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--v2-orange)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--v2-orange)]" aria-hidden />
          {hero.eyebrow}
        </p>
        <h1 className="mt-5 max-w-[18ch] font-display text-[clamp(2.5rem,5.6vw,4.25rem)] font-semibold leading-[1.03] tracking-tight text-[var(--v2-ink)]">
          {hero.headline}
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-[var(--v2-muted)] sm:text-lg">{hero.lede}</p>
        <div className="mt-7 flex flex-wrap items-center gap-5 sm:mt-9">
          <a
            href={hero.primaryCta.href}
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-[var(--v2-orange)] px-6 text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--v2-orange-strong)]"
          >
            {hero.primaryCta.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <a
            href={hero.secondaryCta.href}
            className="inline-flex h-12 items-center text-sm font-medium text-[var(--v2-muted)] underline decoration-[var(--v2-line-strong)] underline-offset-4 transition-colors hover:text-[var(--v2-ink)]"
          >
            {hero.secondaryCta.label}
          </a>
        </div>

        <p className="mt-12 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--v2-faint)] sm:mt-16">
          {hero.channels.map((channel, i) => (
            <span key={channel} className="inline-flex items-center gap-1.5">
              <ChannelDot platform={channel} />
              {channel}
              {i < hero.channels.length - 1 && <span className="mx-1 text-[var(--v2-line-strong)]">—</span>}
            </span>
          ))}
          <ArrowRight className="mx-1 h-3.5 w-3.5 text-[var(--v2-faint)]" aria-hidden />
          <span className="font-medium text-[var(--v2-ink)]">one organised inbox</span>
        </p>
      </div>

      {/* The product itself, given real room — intentionally wider than the
          copy column above it rather than boxed into a matching column. */}
      <div className="mx-auto mt-6 max-w-[1320px] px-3 sm:mt-8 sm:px-6 lg:px-4">
        <ProductShell selectedIndex={0} />
      </div>
    </section>
  );
}
