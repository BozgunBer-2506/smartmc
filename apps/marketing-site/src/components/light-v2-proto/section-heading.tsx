export function SectionHeading({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--v2-orange)]">{eyebrow}</p>
      <h2 className="mt-4 font-display text-[clamp(1.875rem,3.4vw,2.75rem)] font-semibold leading-tight tracking-tight text-[var(--v2-ink)]">
        {title}
      </h2>
      <p className="mt-4 text-base leading-relaxed text-[var(--v2-muted)] sm:text-lg">{lede}</p>
    </div>
  );
}
