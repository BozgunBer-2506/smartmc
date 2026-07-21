import { Section } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { StatusPill } from "@/components/ui/status-pill";
import { security } from "@/content/site";

export function Security() {
  return (
    <Section id="security" eyebrow={security.eyebrow} title={security.title} lede={security.lede}>
      <div className="grid gap-5 sm:grid-cols-2">
        {security.items.map((item, i) => (
          <Reveal key={item.title} delay={i * 0.05}>
            <div className="flex h-full flex-col rounded-card border border-line bg-panel p-7 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-display text-[1.0625rem] font-medium tracking-tight text-paper">
                  {item.title}
                </h3>
                <StatusPill status={item.status} />
              </div>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
