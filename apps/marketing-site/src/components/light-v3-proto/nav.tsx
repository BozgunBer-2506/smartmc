"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import { brand } from "@/content/site";
import { cn } from "@/lib/utils";

/**
 * Local to /light-v3 — the shared `nav` array in content/site.ts points at
 * the dark baseline's section ids (#unified-inbox, #identity-graph,
 * #architecture, #roadmap, #faq), none of which exist on this page. Using
 * it here would silently produce dead links, so v3 defines its own list
 * against its own real section ids instead of editing shared content.
 */
const NAV_LINKS = [
  { label: "Product", href: "#context" },
  { label: "Identity", href: "#identity" },
  { label: "Automation", href: "#automation" },
  { label: "Getting started", href: "#getting-started" },
];

export function LightV3Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-colors duration-300",
        scrolled ? "border-b border-[var(--v3-line)] bg-[var(--v3-bg)]/90 backdrop-blur-md" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-20 max-w-[1320px] items-center justify-between gap-6 px-6 lg:px-10">
        <a href="#top" className="flex shrink-0 items-center">
          {/* Approved production wordmark — one integrated mark. Exact small
              pixel dimensions passed to next/image (not a CSS width class)
              to avoid the dev-mode class-not-applied overflow bug found in
              /light and /light-v2. */}
          <Image src="/looktra-wordmark-dark.png" alt={brand.name} width={150} height={25} priority unoptimized />
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-[var(--v3-muted)] transition-colors hover:text-[var(--v3-ink)]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <a
            href="#cta"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-[var(--v3-orange-button)] px-5 text-sm font-medium text-white transition-colors hover:bg-[var(--v3-orange-button-hover)]"
          >
            Request early access
            <span aria-hidden>→</span>
          </a>
        </div>

        <button
          type="button"
          className="md:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5 text-[var(--v3-ink)]" /> : <Menu className="h-5 w-5 text-[var(--v3-ink)]" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-[var(--v3-line)] bg-[var(--v3-bg)] md:hidden">
          <div className="mx-auto flex max-w-[1320px] flex-col px-6 py-3">
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="py-3 text-sm text-[var(--v3-muted)] transition-colors hover:text-[var(--v3-ink)]"
              >
                {item.label}
              </a>
            ))}
            <a
              href="#cta"
              onClick={() => setOpen(false)}
              className="mt-3 inline-flex h-11 items-center justify-center rounded-lg bg-[var(--v3-orange-button)] px-5 text-sm font-medium text-white"
            >
              Request early access
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}
