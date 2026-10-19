import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-[var(--l-orange)] text-white hover:brightness-[1.06] shadow-[0_1px_0_0_rgba(255,255,255,0.25)_inset,0_10px_24px_-12px_rgba(251,86,39,0.55)]",
  outline: "border border-[var(--l-border-strong)] bg-[var(--l-surface)] text-[var(--l-ink)] hover:border-[var(--l-orange)]",
  ghost: "text-[var(--l-muted)] hover:text-[var(--l-ink)]",
};

const sizes: Record<Size, string> = {
  md: "h-10 px-4",
  lg: "h-12 px-6 text-[0.9375rem]",
};

export function LightButton({
  asChild,
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: Variant;
  size?: Size;
}) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
