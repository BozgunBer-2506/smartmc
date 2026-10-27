import { ArrowDown, ArrowRight } from "lucide-react";
import { hero, brand } from "@/content/light-prototypes";
import { LightButton } from "./button";
import { ConnectorChip } from "./connector-mark";
import { LightInboxPreview } from "./inbox-preview";

export function LightHero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto max-w-[1200px] px-6 py-10 sm:py-14 lg:px-8 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-center lg:gap-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--l-orange-border)] bg-[var(--l-orange-soft)] px-3 py-1 text-xs font-medium uppercase tracking-wide text-[var(--l-orange)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--l-orange)]" aria-hidden />
              {hero.eyebrow}
            </p>
            <h1 className="mt-5 max-w-[16ch] font-display text-[clamp(2.25rem,5.4vw,3.75rem)] font-semibold leading-[1.05] tracking-tight text-[var(--l-ink)] sm:mt-7">
              {hero.headline}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--l-muted)] sm:text-lg">
              {hero.lede}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3 sm:mt-9">
              <LightButton asChild size="lg">
                <a href={hero.primaryCta.href}>
                  {hero.primaryCta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </LightButton>
              <a
                href={hero.secondaryCta.href}
                className="inline-flex h-12 items-center text-sm font-medium text-[var(--l-muted)] underline decoration-[var(--l-border-strong)] underline-offset-4 transition-colors hover:text-[var(--l-ink)]"
              >
                {hero.secondaryCta.label}
              </a>
            </div>
          </div>

          <div aria-label="Connected apps coming together in a Looktra inbox">
            <ul className="flex flex-wrap justify-center gap-2">
              {hero.channels.map((channel) => (
                <li key={channel}>
                  <ConnectorChip platform={channel} />
                </li>
              ))}
            </ul>
            <div className="flex flex-col items-center gap-1 py-3 text-[var(--l-orange)]">
              <ArrowDown className="h-4 w-4" aria-hidden />
              <span className="font-display text-sm font-semibold">{brand.name}</span>
              <ArrowDown className="h-4 w-4" aria-hidden />
            </div>
            <LightInboxPreview compact />
          </div>
        </div>
      </div>
    </section>
  );
}
