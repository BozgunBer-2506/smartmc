import { Section } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { StatusPill } from "@/components/ui/status-pill";
import { solution } from "@/content/site";

export function Solution() {
  return (
    <Section id="solution" eyebrow={solution.eyebrow} title={solution.title} lede={solution.lede}>
      <div className="grid gap-5 md:grid-cols-3">
        {solution.pillars.map((p, i) => (
          <Reveal key={p.title} delay={i * 0.06}>
            <div className="flex h-full flex-col rounded-card border border-line bg-panel p-7 shadow-card">
              <StatusPill status={p.status} className="self-start" />
              <h3 className="mt-5 font-display text-[1.0625rem] font-medium tracking-tight text-paper">
                {p.title}
              </h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{p.body}</p>
              {p.note ? (
                <p className="mt-auto pt-6 font-mono text-[0.6875rem] text-faint">{p.note}</p>
              ) : null}
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
