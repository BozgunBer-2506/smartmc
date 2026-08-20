import * as React from "react";
import { cn } from "../lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border border-border-subtle bg-surface-1 px-3 text-sm text-text-primary placeholder:text-text-disabled transition-colors focus-visible:outline-none focus-visible:border-border-strong disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
