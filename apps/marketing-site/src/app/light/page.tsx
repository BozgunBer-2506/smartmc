import { LightNav } from "@/components/light-proto/nav";
import { LightHero } from "@/components/light-proto/hero";
import { LightUnifiedInbox } from "@/components/light-proto/unified-inbox-section";
import { LightDaniel } from "@/components/light-proto/daniel-section";
import { brand } from "@/content/site";

/**
 * Isolated light consumer-UI design prototype. Not linked from the live
 * dark site; reachable only at /light for direct A/B comparison against "/".
 * Scope: navbar, hero, unified inbox, Daniel/identity sections only — see
 * the design-prototype conversation for the full brief.
 */
export default function LightPrototypePage() {
  return (
    <>
      <LightNav />
      <main>
        <LightHero />
        <LightUnifiedInbox />
        <LightDaniel />
      </main>
      <footer className="border-t border-[var(--l-border)] py-10">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 px-6 text-xs text-[var(--l-faint)] sm:flex-row lg:px-8">
          <span>© 2026 {brand.name}. Design prototype — not the live site.</span>
          <div className="flex items-center gap-4">
            <a
              href="https://thebozgun.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--l-orange)] underline decoration-[var(--l-orange-border)] underline-offset-4 transition-colors hover:text-[var(--l-ink)]"
            >
              IT &amp; Web by thebozgun.com
            </a>
            <a href="/" className="font-medium text-[var(--l-muted)] hover:text-[var(--l-ink)]">
              View current site →
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
