import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { providerColors } from "@smc/design-tokens";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
  {
    variants: {
      variant: {
        neutral: "border-border-subtle bg-surface-2 text-text-secondary",
        success: "border-status-success/30 bg-status-success/10 text-status-success",
        warning: "border-status-warning/30 bg-status-warning/10 text-status-warning",
        danger: "border-status-danger/30 bg-status-danger/10 text-status-danger",
        info: "border-status-info/30 bg-status-info/10 text-status-info",
        priority: "border-accent-priority/30 bg-accent-priority/10 text-accent-priority",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

/**
 * A per-provider badge (docs/DESIGN_SYSTEM.md Section 4.2) - the one
 * deliberate, bounded exception to "no provider-specific visuals": these
 * colors are fixed, not theme-derived, and used only on this small badge
 * element, never as a background/border/accent anywhere else.
 */
export function ProviderBadge({ providerKey, className }: { providerKey: string; className?: string }) {
  const entry = providerColors[providerKey] ?? providerColors.default!;
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", className)}
      style={{ background: entry.background, color: entry.foreground }}
    >
      {entry.label}
    </span>
  );
}
