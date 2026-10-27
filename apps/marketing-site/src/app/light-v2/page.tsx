import { LightV2Nav } from "@/components/light-v2-proto/nav";
import { LightV2Hero } from "@/components/light-v2-proto/hero";
import { LightV2Inbox } from "@/components/light-v2-proto/inbox-section";
import { LightV2Daniel } from "@/components/light-v2-proto/daniel-section";
import { TechnicalSectionStudy } from "@/components/light-v2-proto/technical-study";
import { brand } from "@/content/site";

/**
 * Light Concept v2 — separate visual direction from /light (v1, rejected).
 * Not linked from the live site. Reachable only at /light-v2.
 * Scope: navbar, hero, unified inbox, Daniel section, + one isolated
 * technical-section study. See the design-prototype conversation for the
 * full v2 brief and why v1 was rejected.
 */
export default function LightV2Page() {
  return (
    <>
      <LightV2Nav />
      <main>
        <LightV2Hero />
        <LightV2Inbox />
        <LightV2Daniel />
        <TechnicalSectionStudy />
      </main>
      <footer className="border-t border-[var(--v2-line)] py-10">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-4 px-6 text-xs text-[var(--v2-faint)] sm:flex-row lg:px-8">
          <span>© 2026 {brand.name}. Design prototype — not the live site.</span>
          <div className="flex items-center gap-4">
            <a href="/" className="font-medium text-[var(--v2-muted)] hover:text-[var(--v2-ink)]">
              Dark baseline
            </a>
            <a href="/light" className="font-medium text-[var(--v2-muted)] hover:text-[var(--v2-ink)]">
              Light v1
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
