import { Section } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { StatusPill } from "@/components/ui/status-pill";
import { roadmap } from "@/content/site";
import { cn } from "@/lib/utils";

/**
 * Numbering is used here because the content genuinely is an ordered sequence.
 * The node colour repeats the site rule: aqua shipped, copper in progress,
 * hollow for planned.
 */
export function Roadmap() {
  const shipped = roadmap.phases.filter((p) => p.status === "live").length;

  return (
    <Section
      id="roadmap"
      eyebrow={roadmap.eyebrow}
      title={roadmap.title}
      lede={roadmap.lede}
      aside={
        <span className="font-mono text-[0.6875rem] text-faint">
          {shipped} of {roadmap.phases.length} phases shipped
        </span>
      }
    >
      <ol className="relative">
        <span
          className="absolute left-[7px] top-2 h-[calc(100%-1rem)] w-px bg-line"
          aria-hidden
        />
        {roadmap.phases.map((phase, i) => (
          <Reveal key={phase.n} delay={Math.min(i, 4) * 0.04}>
            <li className="relative flex gap-6 pb-9 pl-8">
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-1.5 flex h-[15px] w-[15px] items-center justify-center rounded-full border bg-ink",
                  phase.status === "live" && "border-signal/45",
                  phase.status === "building" && "border-ember/55",
                  phase.status === "planned" && "border-line-strong",
                )}
              >
                <span
                  className={cn(
                    "h-[5px] w-[5px] rounded-full",
                    phase.status === "live" && "bg-signal",
                    phase.status === "building" && "animate-node bg-ember",
                    phase.status === "planned" && "bg-line-strong",
                  )}
                />
              </span>

              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[0.6875rem] text-faint">
                    Phase {String(phase.n).padStart(2, "0")}
                  </span>
                  <StatusPill status={phase.status} />
                </div>
                <h3
                  className={cn(
                    "mt-2.5 font-display text-[1.0625rem] font-medium tracking-tight",
                    phase.status === "planned" ? "text-muted" : "text-paper",
                  )}
                >
                  {phase.title}
                </h3>
                <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">
                  {phase.body}
                </p>
              </div>
            </li>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}
