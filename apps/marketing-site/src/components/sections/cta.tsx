import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/site/reveal";
import { cta, brand } from "@/content/site";

export function Cta() {
  return (
    <section id="cta" className="relative scroll-mt-24 overflow-hidden border-t border-line">
      <div className="pointer-events-none absolute inset-0 grid-fade" aria-hidden />
      <div className="container relative">
        <div className="relative py-24 lg:py-28 lg:pl-16">
          <span className="spine" aria-hidden />
          <span className="spine-node top-[6px]" aria-hidden>
            <span className="h-[5px] w-[5px] rounded-full bg-signal" />
          </span>

          <Reveal>
            <p className="font-mono text-eyebrow uppercase text-faint">{cta.eyebrow}</p>
            <h2 className="mt-5 max-w-2xl font-display text-title text-paper">{cta.title}</h2>
            <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-muted">{cta.lede}</p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href={cta.primary.href}>
                  {cta.primary.label}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={cta.secondary.href}>{cta.secondary.label}</a>
              </Button>
            </div>

            <p className="mt-6 font-mono text-[0.6875rem] text-faint">{cta.fineprint}</p>
            <p className="mt-14 max-w-md border-l border-line pl-4 font-display text-[1.0625rem] leading-relaxed tracking-tight text-muted">
              {brand.vision}
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
