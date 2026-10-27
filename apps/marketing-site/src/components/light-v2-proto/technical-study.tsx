import { solution, statusLabel } from "@/content/site";

/**
 * Isolated study, not a real section: tests whether the light v2 visual
 * language can carry technical/B2B credibility without reverting to a dark
 * panel. Reuses real pipeline copy from `solution.pillars` — no invented
 * claims. Deliberately small and clearly labeled as a study.
 */
export function TechnicalSectionStudy() {
  return (
    <section className="border-t border-[var(--v2-line)] bg-[var(--v2-surface-soft)] py-16 sm:py-20">
      <div className="mx-auto max-w-[1240px] px-6 lg:px-8">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-[var(--v2-faint)]">
          Technical section study — isolated test, not a shipped section
        </p>
        <h3 className="mt-3 max-w-xl font-display text-xl font-semibold tracking-tight text-[var(--v2-ink)] sm:text-2xl">
          Can this visual language hold technical weight?
        </h3>

        <div className="mt-10 grid gap-0 sm:grid-cols-3">
          {solution.pillars.map((pillar) => (
            <div key={pillar.title} className="border-t border-[var(--v2-line-strong)] pt-5 sm:px-6 sm:first:pl-0">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--v2-orange)]" aria-hidden />
                <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-[var(--v2-faint)]">
                  {statusLabel[pillar.status]}
                </span>
              </div>
              <p className="mt-3 font-display text-[0.9375rem] font-semibold text-[var(--v2-ink)]">{pillar.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--v2-muted)]">{pillar.body}</p>
              {pillar.note && (
                <p className="mt-2 font-mono text-[0.6875rem] text-[var(--v2-faint)]">{pillar.note}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
