import * as React from "react";
import { cn } from "../lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-lg border border-border-subtle bg-surface-1 p-3", className)} {...props} />
  ),
);
Card.displayName = "Card";

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold text-text-primary", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-text-secondary", className)} {...props} />;
}
