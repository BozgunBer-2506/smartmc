import { partners } from "@/content/site";
import { Reveal } from "@/components/site/reveal";

export function Partners() {
  return (
    <section className="relative border-t border-line">
      <div className="container">
        <div className="relative py-14 lg:pl-16">
          <span className="spine" aria-hidden />
          <Reveal>
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-xs">
                <p className="font-mono text-eyebrow uppercase text-faint">{partners.eyebrow}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted">{partners.title}</p>
              </div>

              <ul className="flex flex-wrap items-center gap-x-10 gap-y-6">
                {partners.slots.map((name) => (
                  <li key={name} className="flex items-center gap-2.5 opacity-60">
                    <span
                      aria-hidden
                      className="h-5 w-5 rounded-[5px] border border-line-strong bg-raised"
                    />
                    <span className="font-display text-sm font-medium tracking-tight text-muted">
                      {name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-8 font-mono text-[0.6875rem] text-faint">{partners.note}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
