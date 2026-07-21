"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { Section } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { identityGraph as ig } from "@/content/site";

/**
 * Signature element of the site. Three platform handles resolving into one
 * person record, drawn as an actual graph rather than a stock illustration.
 */
export function IdentityGraph() {
  return (
    <Section id="identity-graph" eyebrow={ig.eyebrow} title={ig.title} lede={ig.lede}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center">
        <Reveal>
          <div className="rounded-panel border border-line bg-panel p-4 shadow-lift sm:p-8">
            <GraphSvg />
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <ul className="space-y-5">
            {ig.benefits.map((b) => (
              <li key={b} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-signal/25 bg-signal/[0.07]">
                  <Check className="h-3 w-3 text-signal" aria-hidden />
                </span>
                <span className="text-[0.9375rem] leading-relaxed text-muted">{b}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 rounded-card border border-line bg-raised p-5">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-faint">
              Resolved record
            </p>
            <p className="mt-3 font-mono text-xs leading-relaxed text-muted">
              <span className="text-paper">{ig.person.id}</span>
              <br />
              display_name = &quot;{ig.person.name}&quot;
              <br />
              organisation = &quot;{ig.person.org}&quot;
              <br />
              linked_handles = {ig.identities.length}
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

function GraphSvg() {
  const reduced = useReducedMotion();
  const rows = [58, 168, 278];

  return (
    <svg
      viewBox="0 0 700 336"
      className="h-auto w-full font-mono"
      role="img"
      aria-label={`Three platform handles, ${ig.identities
        .map((i) => `${i.platform} ${i.handle}`)
        .join(", ")}, resolving into one person record for ${ig.person.name}.`}
    >
      {/* edges */}
      {rows.map((y, i) => {
        const d = `M244 ${y + 26} C 340 ${y + 26}, 380 168, 466 168`;
        return (
          <g key={`edge-${i}`}>
            <path d={d} fill="none" stroke="var(--line-strong)" strokeWidth="1" />
            <motion.path
              d={d}
              fill="none"
              stroke="var(--signal)"
              strokeWidth="1.25"
              strokeLinecap="round"
              initial={reduced ? { pathLength: 1, opacity: 0.55 } : { pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 0.55 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.9, delay: 0.15 + i * 0.18, ease: "easeInOut" }}
            />
          </g>
        );
      })}

      {/* handle nodes */}
      {ig.identities.map((id, i) => (
        <g key={id.platform}>
          <rect
            x="12"
            y={rows[i]}
            width="232"
            height="52"
            rx="10"
            fill="var(--raised)"
            stroke="var(--line-strong)"
          />
          <text x="30" y={rows[i] + 22} fill="var(--paper)" fontSize="12.5">
            {id.handle}
          </text>
          <text x="30" y={rows[i] + 39} fill="var(--faint)" fontSize="10.5">
            {id.platform.toLowerCase()} / {id.meta}
          </text>
          <circle cx="244" cy={rows[i] + 26} r="3" fill="var(--line-strong)" />
        </g>
      ))}

      {/* person node */}
      <g>
        <circle cx="530" cy="168" r="64" fill="var(--signal)" opacity="0.05" />
        <circle cx="530" cy="168" r="64" fill="none" stroke="var(--signal)" strokeOpacity="0.22" />
        <circle cx="530" cy="168" r="46" fill="var(--panel)" stroke="var(--signal)" strokeOpacity="0.45" />
        <text x="530" y="163" textAnchor="middle" fill="var(--paper)" fontSize="13">
          {ig.person.name}
        </text>
        <text x="530" y="182" textAnchor="middle" fill="var(--signal)" fontSize="10">
          resolved
        </text>
        <text x="530" y="256" textAnchor="middle" fill="var(--faint)" fontSize="10.5">
          {ig.person.id}
        </text>
      </g>
    </svg>
  );
}
