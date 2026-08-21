import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

/**
 * The real Button (docs/DESIGN_SYSTEM.md Section 9, docs/ROADMAP.md Phase
 * 22) - replaces the Phase 1 placeholder that existed only so `@smc/ui` was
 * a real workspace package apps/web could depend on from day one. `primary`
 * is deliberately an accent-adjacent neutral, never the priority accent
 * color, which is reserved for VIP/urgency signaling (Section 2) - a
 * button using it for its own chrome would compete with that meaning.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-surface-2 text-text-primary border border-border-subtle hover:border-border-strong",
        outline: "border border-border-subtle bg-transparent text-text-primary hover:bg-surface-2",
        ghost: "text-text-secondary hover:text-text-primary hover:bg-surface-2",
        destructive: "bg-status-danger text-white hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-11 px-5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
