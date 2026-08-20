import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const alertVariants = cva("rounded-lg border px-3 py-2 text-sm", {
  variants: {
    variant: {
      neutral: "border-border-subtle bg-surface-1 text-text-secondary",
      success: "border-status-success/30 bg-status-success/10 text-status-success",
      warning: "border-status-warning/30 bg-status-warning/10 text-status-warning",
      danger: "border-status-danger/30 bg-status-danger/10 text-status-danger",
      info: "border-status-info/30 bg-status-info/10 text-status-info",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div role="alert" className={cn(alertVariants({ variant, className }))} {...props} />;
}
