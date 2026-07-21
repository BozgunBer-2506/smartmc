import { brand, nav } from "@/content/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="container">
        <div className="flex flex-col gap-10 py-14 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <p className="font-display text-[0.9375rem] font-medium tracking-tight text-paper">
              {brand.name}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">{brand.tagline}</p>
            <p className="mt-6 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-faint">
              {brand.vision}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <FooterCol
              title="Product"
              links={nav.map((n) => ({ label: n.label, href: n.href }))}
            />
            <FooterCol
              title="Company"
              links={[
                { label: "Early access", href: "#cta" },
                { label: "Contact", href: `mailto:hello@${brand.domain}` },
              ]}
            />
            <FooterCol
              title="Legal"
              links={[
                { label: "Privacy", href: "/privacy" },
                { label: "Terms", href: "/terms" },
              ]}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-line py-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs text-faint">
            &copy; {new Date().getFullYear()} {brand.name}. Pre-launch.
          </p>
          <p className="font-mono text-xs text-faint">
            Feature status on this page reflects what is deployed, not what is planned.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="font-mono text-eyebrow uppercase text-faint">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} className="text-sm text-muted transition-colors hover:text-paper">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
