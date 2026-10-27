import { ArrowDown, ArrowRight, Check, UserRound } from "lucide-react";
import { identityGraph as ig } from "@/content/light-prototypes";
import { LightSection } from "./section";
import { ConnectorMark } from "./connector-mark";

export function LightDaniel() {
  return (
    <LightSection id="identity-graph" eyebrow={ig.eyebrow} title={ig.title} lede={ig.lede}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center">
        <div className="rounded-2xl border border-[var(--l-border)] bg-[var(--l-surface)] p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_24px_60px_-36px_rgba(20,17,15,0.25)] sm:p-8">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-[var(--l-orange-soft)] px-3 py-1 text-xs font-medium text-[var(--l-orange)]">
            Suggested match · awaiting your approval
          </p>
          <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,0.7fr)]">
            <ul className="space-y-3">
              {ig.identities.map((identity) => (
                <li
                  key={identity.platform}
                  className="flex gap-3 rounded-xl border border-[var(--l-border)] bg-[var(--l-bg-soft)] p-4"
                >
                  <ConnectorMark platform={identity.platform} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--l-muted)]">Daniel on {identity.platform}</p>
                    <p className="mt-1 break-words text-xs text-[var(--l-faint)]">{identity.handle}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--l-ink)]">{identity.preview}</p>
                  </div>
                </li>
              ))}
            </ul>
            <ArrowRight className="hidden h-5 w-5 text-[var(--l-orange)] sm:block" aria-hidden />
            <ArrowDown className="mx-auto h-5 w-5 text-[var(--l-orange)] sm:hidden" aria-hidden />
            <div className="rounded-xl border border-[var(--l-orange-border)] bg-[var(--l-orange-soft)] p-5 text-center">
              <UserRound className="mx-auto h-7 w-7 text-[var(--l-orange)]" aria-hidden />
              <p className="mt-3 font-display text-lg font-semibold text-[var(--l-ink)]">{ig.person.name}</p>
              <p className="mt-2 text-sm text-[var(--l-muted)]">One person in Looktra</p>
              <p className="mt-4 text-xs font-medium text-[var(--l-orange)]">3 linked accounts</p>
              <button
                type="button"
                className="mt-5 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--l-orange)] px-3 text-xs font-semibold text-white"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                Approve this link
              </button>
            </div>
          </div>
        </div>

        <div>
          <ul className="space-y-5">
            {ig.benefits.map((benefit) => (
              <li key={benefit} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--l-orange-border)] bg-[var(--l-orange-soft)]">
                  <Check className="h-3 w-3 text-[var(--l-orange)]" aria-hidden />
                </span>
                <span className="text-[0.9375rem] leading-relaxed text-[var(--l-muted)]">{benefit}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 border-l-2 border-[var(--l-border-strong)] pl-4 text-sm leading-relaxed text-[var(--l-faint)]">
            {ig.note}
          </p>
        </div>
      </div>
    </LightSection>
  );
}
