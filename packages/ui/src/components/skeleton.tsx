import * as React from "react";
import { cn } from "../lib/utils";

/** docs/UI_GUIDE.md Section 17 - a static placeholder block, not a spinner, for any predictable-shape loading content (conversation rows, message bubbles, execution-history entries). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md bg-surface-2", className)} {...props} />;
}
