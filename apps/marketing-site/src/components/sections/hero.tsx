"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hero, brand } from "@/content/site";
import { cn } from "@/lib/utils";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-fade" aria-hidden />

      <div className="container relative">
        <div className="relative py-24 lg:py-32 lg:pl-16">
          <span className="spine" aria-hidden />
          <span className="spine-node top-[26px]" aria-hidden>
            <span className="h-[5px] w-[5px] animate-node rounded-full bg-signal" />
          </span>

          <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-center lg:gap-14">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 font-mono text-eyebrow uppercase text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden />
                {hero.eyebrow}
              </p>

              <h1 className="mt-8 max-w-[15ch] font-display text-display text-paper">
                {hero.headline}
              </h1>

              <p className="mt-7 max-w-xl text-[1.0625rem] leading-relaxed text-muted">
                {hero.lede}
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <a href={hero.primaryCta.href}>
                    {hero.primaryCta.label}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href={hero.secondaryCta.href}>{hero.secondaryCta.label}</a>
                </Button>
              </div>

              <p className="mt-8 max-w-lg border-l border-line pl-4 text-sm leading-relaxed text-faint">
                {hero.statusNote}
              </p>
            </div>

            <EventStream />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The hero thesis: not a fake dashboard, but the actual journey of one message
 * through the pipeline. Honest, specific to this product, and the only place
 * on the page with a timed animation.
 */
function EventStream() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(reduced ? hero.stream.length : 0);

  useEffect(() => {
    if (reduced) {
      setVisible(hero.stream.length);
      return;
    }
    setVisible(0);
    const timers = hero.stream.map((_, i) =>
      setTimeout(() => setVisible((v) => Math.max(v, i + 1)), 450 + i * 420),
    );
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  const done = visible >= hero.stream.length;

  return (
    <div className="rounded-panel border border-line bg-panel shadow-lift">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-faint">
          Message pipeline
        </p>
        <p className="flex items-center gap-2 font-mono text-[0.6875rem] text-muted">
          <span
            className={cn("h-1.5 w-1.5 rounded-full", done ? "bg-signal" : "bg-ember")}
            aria-hidden
          />
          {done ? "delivered in 15ms" : "processing"}
        </p>
      </div>

      <ol className="divide-y divide-line">
        {hero.stream.map((row, i) => (
          <motion.li
            key={row.event}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: i < visible ? 1 : 0.12 }}
            transition={{ duration: 0.35 }}
            className="grid grid-cols-[auto_1fr] items-start gap-x-4 px-5 py-4 sm:grid-cols-[auto_auto_1fr]"
          >
            <span className="font-mono text-xs text-faint">{row.t}</span>
            <span className="hidden font-mono text-xs text-muted sm:block">{row.source}</span>
            <span className="col-span-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-mono text-xs text-paper">{row.event}</span>
              <span className="font-mono text-xs text-faint">{row.detail}</span>
            </span>
          </motion.li>
        ))}
      </ol>

      <p className="border-t border-line px-5 py-3.5 font-mono text-[0.6875rem] leading-relaxed text-faint">
        One message entering {brand.short}. Same four stages for every platform.
      </p>
    </div>
  );
}
