import { Section } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { problem } from "@/content/site";

export function Problem() {
  return (
    <Section id="problem" eyebrow={problem.eyebrow} title={problem.title} lede={problem.lede}>
      <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
        {problem.points.map((p, i) => (
          <Reveal key={p.title} delay={i * 0.05}>
            <div className="h-full bg-panel p-7">
              <p className="font-mono text-[0.6875rem] text-faint">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-4 font-display text-[1.0625rem] font-medium tracking-tight text-paper">
                {p.title}
              </h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{p.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
