import type { ReactNode } from "react";

export function LightSection({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-t border-[var(--l-border)] py-16 sm:py-24">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--l-orange)]">{eyebrow}</p>
        <h2 className="mt-4 max-w-2xl font-display text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-tight text-[var(--l-ink)]">
          {title}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--l-muted)]">{lede}</p>
        <div className="mt-10 sm:mt-12">{children}</div>
      </div>
    </section>
  );
}
