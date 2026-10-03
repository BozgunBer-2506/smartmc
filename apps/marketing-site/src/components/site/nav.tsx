"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import Image from "next/image";
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
        <a href="#top" className="flex shrink-0 items-center">
          <Image
            src="/looktra-wordmark-white.png"
            alt={brand.name}
            width={1016}
            height={168}
            className="h-auto w-[127px]"
            priority
            unoptimized
          />
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
