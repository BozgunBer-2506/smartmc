import Image from "next/image";
import { brand } from "@/content/site";

/** Same real section ids as the navbar — kept local to /light-v3 for the
 * same reason (the shared `nav` content array doesn't match this page). */
const FOOTER_LINKS = [
  { label: "Product", href: "#context" },
  { label: "Identity", href: "#identity" },
  { label: "Automation", href: "#automation" },
  { label: "Getting started", href: "#getting-started" },
];

export function LightV3Footer() {
  return (
    <footer className="border-t border-[var(--v3-line)]">
      <div className="mx-auto max-w-[1320px] px-6 py-14 lg:px-10">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Image
              src="/looktra-wordmark-dark.png"
              alt={brand.name}
              width={127}
              height={21}
              unoptimized
            />
            <a
              href="mailto:hello@looktra.com"
              className="mt-4 block text-sm text-[var(--v3-muted)] transition-colors hover:text-[var(--v3-ink)]"
            >
              hello@looktra.com
            </a>
          </div>

          <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3">
            {FOOTER_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm text-[var(--v3-muted)] transition-colors hover:text-[var(--v3-ink)]"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-10 border-t border-[var(--v3-line)] pt-6">
          <p className="text-xs text-[var(--v3-faint)]">&copy; 2026 {brand.name}. Early access.</p>
        </div>
      </div>
    </footer>
  );
}
