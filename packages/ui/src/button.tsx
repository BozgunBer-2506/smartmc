import type { ButtonHTMLAttributes } from "react";

/**
 * Placeholder primitive - a real shadcn/ui-based Button per docs/DESIGN_SYSTEM.md
 * Section 9 is future work once Phase 9's UI build actually needs the full
 * token/component system. This exists only so @smc/ui is a real, working
 * workspace package apps/web can depend on from day one.
 */
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { style, ...rest } = props;
  return (
    <button
      {...rest}
      style={{
        padding: "8px 16px",
        borderRadius: 6,
        border: "1px solid #2A3441",
        background: "#1B2333",
        color: "#F5F7FA",
        cursor: "pointer",
        fontSize: 14,
        ...style,
      }}
    />
  );
}
