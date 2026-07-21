"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brand, nav } from "@/content/site";
import { cn } from "@/lib/utils";

export function SiteNav() {
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
        scrolled ? "border-b border-line bg-ink/85 backdrop-blur-md" : "border-b border-transparent",
      )}
    >
      <div className="container flex h-16 items-center justify-between gap-6">
        <a href="#top" className="flex items-center gap-2.5">
          <Wordmark />
          <span className="font-display text-[0.9375rem] font-medium tracking-tight text-paper">
            {brand.name}
          </span>
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-muted transition-colors hover:text-paper"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button asChild size="sm">
            <a href="#cta">Request early access</a>
          </Button>
        </div>

        <button
          type="button"
          className="md:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5 text-paper" /> : <Menu className="h-5 w-5 text-paper" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-line bg-ink md:hidden">
          <div className="container flex flex-col py-3">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="py-3 text-sm text-muted transition-colors hover:text-paper"
              >
                {item.label}
              </a>
            ))}
            <Button asChild className="mt-3" size="md">
              <a href="#cta" onClick={() => setOpen(false)}>
                Request early access
              </a>
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/** Four converging strokes resolving into one node: the product in 20px. */
function Wordmark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M2 3.5h5M2 8h4M2 12h4M2 16.5h5" stroke="var(--line-strong)" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7 3.5c4 0 4 6.5 6.5 6.5M6 8c3.5 0 4.5 2 7.5 2M6 12c3.5 0 4.5-2 7.5-2M7 16.5c4 0 4-6.5 6.5-6.5" stroke="var(--faint)" strokeWidth="1.2" />
      <circle cx="15.5" cy="10" r="2.5" fill="var(--signal)" />
    </svg>
  );
}
