"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import { brand, nav } from "@/content/site";
import { LightButton } from "./button";
import { cn } from "@/lib/utils";

export function LightNav() {
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
        scrolled
          ? "border-b border-[var(--l-border)] bg-[var(--l-bg)]/90 backdrop-blur-md"
          : "border-b border-transparent",
      )}
    >
      <div className="container mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-6 px-6 lg:px-8">
        <a href="#top" className="flex shrink-0 items-center">
          <Image
            src="/looktra-wordmark-dark.png"
            alt={brand.name}
            width={127}
            height={21}
            priority
            unoptimized
          />
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-[var(--l-muted)] transition-colors hover:text-[var(--l-ink)]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <LightButton asChild size="md" className="h-9 px-3.5 text-sm">
            <a href="#cta">Request early access</a>
          </LightButton>
        </div>

        <button
          type="button"
          className="md:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5 text-[var(--l-ink)]" /> : <Menu className="h-5 w-5 text-[var(--l-ink)]" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-[var(--l-border)] bg-[var(--l-bg)] md:hidden">
          <div className="mx-auto flex max-w-[1200px] flex-col px-6 py-3">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="py-3 text-sm text-[var(--l-muted)] transition-colors hover:text-[var(--l-ink)]"
              >
                {item.label}
              </a>
            ))}
            <LightButton asChild className="mt-3">
              <a href="#cta" onClick={() => setOpen(false)}>
                Request early access
              </a>
            </LightButton>
          </div>
        </div>
      ) : null}
    </header>
  );
}
