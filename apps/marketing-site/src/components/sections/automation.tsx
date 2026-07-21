import { ArrowRight } from "lucide-react";
import { Section } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { StatusPill } from "@/components/ui/status-pill";
import { automation } from "@/content/site";

export function Automation() {
  return (
    <Section
      id="automation"
      eyebrow={automation.eyebrow}
      title={automation.title}
      lede={automation.lede}
      aside={<StatusPill status={automation.status} label="Builder in progress" />}
    >
      <Reveal>
        <div className="rounded-panel border border-line bg-panel p-6 shadow-lift sm:p-10">
          <ol className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            {automation.flow.map((step, i) => (
              <li key={step.label} className="flex flex-1 items-center gap-4">
                <div className="flex-1 rounded-card border border-line bg-raised p-5">
                  <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-faint">
                    {step.kind}
                  </p>
                  <p className="mt-3 text-sm font-medium text-paper">{step.label}</p>
                  <p className="mt-1.5 font-mono text-[0.6875rem] text-muted">{step.detail}</p>
                </div>
                {i < automation.flow.length - 1 ? (
                  <ArrowRight
                    className="hidden h-4 w-4 shrink-0 text-line-strong lg:block"
                    aria-hidden
                  />
                ) : null}
              </li>
            ))}
          </ol>

          <p className="mt-8 border-t border-line pt-6 font-mono text-[0.6875rem] leading-relaxed text-faint">
            Design preview. The engine consumes the same events shown in the pipeline above.
          </p>
        </div>
      </Reveal>
    </Section>
  );
}
