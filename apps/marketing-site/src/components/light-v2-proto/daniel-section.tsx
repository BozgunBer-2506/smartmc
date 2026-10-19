import { ArrowRight, Check } from "lucide-react";
import Image from "next/image";
import { identityGraph as ig } from "@/content/site";
import { SectionHeading } from "./section-heading";
import { ChannelDot, ChannelLabel, Avatar } from "./connector";

/**
 * Product-led identity interaction instead of a three-cards-plus-arrow
 * flowchart: a real suggested-match notification, then the "after" state as
 * one continuous conversation feed that keeps each message's source visible
 * rather than three separate panels.
 */
export function LightV2Daniel() {
  return (
    <section id="identity-graph" className="border-t border-[var(--v2-line)] py-20 sm:py-28">
      <div className="mx-auto max-w-[1240px] px-6 lg:px-8">
        <SectionHeading eyebrow={ig.eyebrow} title={ig.title} lede={ig.lede} />

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
          <div>
            {/* Suggested-match notification — genuine UI surface, so it earns its border/elevation. */}
            <div className="flex items-start gap-3 rounded-xl border border-[var(--v2-line)] bg-white p-4 shadow-[0_12px_30px_-20px_rgba(12,11,10,0.2)] sm:p-5">
              <Image src="/looktra-symbol.png" alt="" width={24} height={12} className="mt-1 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--v2-ink)]">These accounts may belong to the same person.</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {ig.identities.map((identity) => (
                    <ChannelLabel key={identity.platform} platform={identity.platform} />
                  ))}
                </p>
                <div className="mt-3 flex items-center gap-4">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--v2-orange)] px-3 text-xs font-semibold text-white transition-colors hover:bg-[var(--v2-orange-strong)]"
                  >
                    <Check className="h-3 w-3" aria-hidden />
                    Link accounts
                  </button>
                  <button type="button" className="text-xs font-medium text-[var(--v2-muted)] hover:text-[var(--v2-ink)]">
                    Review
                  </button>
                </div>
              </div>
            </div>

            {/* After approval: one person, one continuous feed, source kept per message. */}
            <div className="mt-6 flex items-center gap-3">
              <Avatar name={ig.person.name} />
              <div>
                <p className="text-sm font-semibold text-[var(--v2-ink)]">{ig.person.name}</p>
                <p className="flex items-center gap-1 text-xs text-[var(--v2-faint)]">
                  {ig.identities.map((identity) => (
                    <ChannelDot key={identity.platform} platform={identity.platform} />
                  ))}
                  {ig.identities.length} connected accounts
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-3 border-l-2 border-[var(--v2-line)] pl-5">
              {ig.identities.map((identity) => (
                <li key={identity.platform}>
                  <p className="text-sm leading-relaxed text-[var(--v2-ink)]">{identity.preview}</p>
                  <p className="mt-1 text-[0.6875rem]">
                    <ChannelLabel platform={identity.platform} />
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <ul className="space-y-4">
              {ig.benefits.map((benefit) => (
                <li key={benefit} className="flex gap-3">
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--v2-orange)]" aria-hidden />
                  <span className="text-[0.9375rem] leading-relaxed text-[var(--v2-muted)]">{benefit}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 border-l-2 border-[var(--v2-line-strong)] pl-4 text-sm leading-relaxed text-[var(--v2-faint)]">
              {ig.note}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
