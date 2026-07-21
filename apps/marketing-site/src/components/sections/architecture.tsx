import { Section } from "@/components/site/section";
import { Reveal } from "@/components/site/reveal";
import { architecture } from "@/content/site";

const stages = [
  { key: "connector", title: "Connector", detail: "Normalise the platform payload", tech: "Connector SDK" },
  { key: "queue", title: "Ingestion queue", detail: "Buffer, retry, backpressure", tech: "Redis / BullMQ" },
  { key: "core", title: "Core services", detail: "Resolve identity, build conversation", tech: "NestJS / Prisma" },
  { key: "delivery", title: "Delivery", detail: "Persist, then push to open clients", tech: "PostgreSQL / WebSocket" },
];

export function Architecture() {
  return (
    <Section
      id="architecture"
      eyebrow={architecture.eyebrow}
      title={architecture.title}
      lede={architecture.lede}
    >
      <Reveal>
        <div className="rounded-panel border border-line bg-panel p-6 shadow-lift sm:p-10">
          {/* diagram, medium screens and up */}
          <svg
            viewBox="0 0 920 260"
            className="hidden h-auto w-full font-mono md:block"
            role="img"
            aria-label="Four stage pipeline: connector, ingestion queue, core services, delivery, all publishing to a shared event bus."
          >
            {stages.map((s, i) => {
              const x = 10 + i * 232;
              return (
                <g key={s.key}>
                  <rect x={x} y="20" width="204" height="96" rx="12" fill="var(--raised)" stroke="var(--line-strong)" />
                  <text x={x + 22} y="50" fill="var(--paper)" fontSize="13">
                    {s.title}
                  </text>
                  <text x={x + 22} y="72" fill="var(--muted)" fontSize="10.5">
                    {s.detail}
                  </text>
                  <text x={x + 22} y="93" fill="var(--faint)" fontSize="10">
                    {s.tech}
                  </text>

                  {/* stage to stage */}
                  {i < stages.length - 1 ? (
                    <g>
                      <line x1={x + 204} y1="68" x2={x + 226} y2="68" stroke="var(--line-strong)" strokeWidth="1" />
                      <path d={`M${x + 226} 68 l-6 -3.5 v7 z`} fill="var(--line-strong)" />
                    </g>
                  ) : null}

                  {/* publish to bus */}
                  <line x1={x + 102} y1="116" x2={x + 102} y2="186" stroke="var(--signal)" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="3 4" />
                  <circle cx={x + 102} cy="186" r="3.5" fill="var(--signal)" fillOpacity="0.55" />
                </g>
              );
            })}

            {/* event bus */}
            <line x1="10" y1="186" x2="910" y2="186" stroke="var(--signal)" strokeOpacity="0.28" strokeWidth="1" />
            <text x="10" y="216" fill="var(--signal)" fontSize="10.5" opacity="0.75">
              event bus
            </text>
            <text x="118" y="216" fill="var(--faint)" fontSize="10.5">
              message.received / identity.resolved / conversation.updated / inbox.push
            </text>
          </svg>

          {/* stacked fallback, small screens */}
          <ol className="space-y-3 md:hidden">
            {stages.map((s) => (
              <li key={s.key} className="rounded-card border border-line bg-raised p-5">
                <p className="text-sm font-medium text-paper">{s.title}</p>
                <p className="mt-1.5 text-[0.8125rem] text-muted">{s.detail}</p>
                <p className="mt-2 font-mono text-[0.6875rem] text-faint">{s.tech}</p>
              </li>
            ))}
          </ol>

          <div className="mt-10 border-t border-line pt-8">
            <p className="font-mono text-eyebrow uppercase text-faint">Stack in production</p>
            <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              {architecture.stack.map((s) => (
                <li key={s.name} className="border-l border-line pl-4">
                  <p className="text-sm text-paper">{s.name}</p>
                  <p className="mt-0.5 font-mono text-[0.6875rem] text-faint">{s.role}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
