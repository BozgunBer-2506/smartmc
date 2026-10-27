"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import { brand, nav } from "@/content/site";
import { cn } from "@/lib/utils";

export function LightV2Nav() {
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
        scrolled ? "border-b border-[var(--v2-line)] bg-white/90 backdrop-blur-md" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-20 max-w-[1240px] items-center justify-between gap-6 px-6 lg:px-8">
        <a href="#top" className="flex shrink-0 items-center">
          {/* Approved production wordmark asset — one integrated mark,
              never the standalone OO typed next to "Looktra". */}
          <Image
            src="/looktra-wordmark-dark.png"
            alt={brand.name}
            width={150}
            height={25}
            priority
            unoptimized
          />
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-[var(--v2-muted)] transition-colors hover:text-[var(--v2-ink)]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <a
            href="#cta"
            className="inline-flex h-10 items-center rounded-lg bg-[var(--v2-orange)] px-4 text-sm font-medium text-white transition-colors hover:bg-[var(--v2-orange-strong)]"
          >
            Request early access
          </a>
        </div>

        <button
          type="button"
          className="md:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5 text-[var(--v2-ink)]" /> : <Menu className="h-5 w-5 text-[var(--v2-ink)]" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-[var(--v2-line)] bg-white md:hidden">
          <div className="mx-auto flex max-w-[1240px] flex-col px-6 py-3">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="py-3 text-sm text-[var(--v2-muted)] transition-colors hover:text-[var(--v2-ink)]"
              >
                {item.label}
              </a>
            ))}
            <a
              href="#cta"
              onClick={() => setOpen(false)}
              className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--v2-orange)] px-4 text-sm font-medium text-white"
            >
              Request early access
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}
