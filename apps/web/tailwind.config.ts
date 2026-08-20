import type { Config } from "tailwindcss";
import { radius, shadows, motion } from "@smc/design-tokens";

/**
 * docs/DESIGN_SYSTEM.md Section 17 - Tailwind class surface bound to the
 * same CSS custom properties `app/globals.css` defines (generated from
 * `packages/design-tokens`), so a token change never requires re-patching
 * brand values into component code. `content` includes `packages/ui`
 * since that's where the actual class strings for shared primitives live -
 * without it, Tailwind would purge classes it never sees referenced from
 * inside `apps/web` itself.
 */
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "background-base": "var(--color-background-base)",
        "surface-1": "var(--color-surface-1)",
        "surface-2": "var(--color-surface-2)",
        "border-subtle": "var(--color-border-subtle)",
        "border-strong": "var(--color-border-strong)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-disabled": "var(--color-text-disabled)",
        "accent-priority": "var(--color-accent-priority)",
        "status-success": "var(--color-status-success)",
        "status-warning": "var(--color-status-warning)",
        "status-danger": "var(--color-status-danger)",
        "status-info": "var(--color-status-info)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: radius.sm,
        md: radius.md,
        lg: radius.lg,
        full: radius.full,
      },
      boxShadow: {
        sm: shadows.sm,
        md: shadows.md,
        lg: shadows.lg,
      },
      transitionDuration: {
        DEFAULT: motion.duration,
      },
      transitionTimingFunction: {
        DEFAULT: motion.easing,
      },
    },
  },
  plugins: [],
};

export default config;
