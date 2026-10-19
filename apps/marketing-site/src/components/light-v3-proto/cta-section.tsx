/**
 * Final CTA. The only real destination that exists today is a mailto link
 * (same pattern as the dark baseline's own working CTA,
 * content/site.ts's `cta.primary.href`) — no form, no waitlist, nothing
 * implying requests are automatically recorded. id="cta" so the navbar's
 * and hero's existing "#cta" links resolve to something real.
 */
export function LightV3Cta() {
  return (
    <section id="cta" className="relative border-t border-[var(--v3-line)]">
      <div className="mx-auto max-w-[700px] px-6 py-24 text-center sm:py-28 lg:px-10 lg:py-32">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--v3-orange)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--v3-orange)]" aria-hidden />
          Early access
        </p>
        <h2 className="mx-auto mt-4 max-w-[20ch] font-display text-[clamp(2.25rem,4.4vw,3.25rem)] font-semibold leading-[1.08] tracking-tight text-[var(--v3-ink)]">
          One inbox. More room to focus.
        </h2>
        <p className="mx-auto mt-5 max-w-[480px] text-base leading-relaxed text-[var(--v3-muted)] sm:text-lg">
          Looktra is in early access. Tell us which connected services matter to you, and we&rsquo;ll review your
          request.
        </p>
        <a
          href="mailto:hello@looktra.com?subject=Early%20access"
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-lg bg-[var(--v3-orange-button)] px-6 text-[0.9375rem] font-medium text-white transition-colors hover:bg-[var(--v3-orange-button-hover)]"
        >
          Request early access
          <span aria-hidden>→</span>
        </a>
      </div>
    </section>
  );
}
