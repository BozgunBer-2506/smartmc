import type { Config } from "tailwindcss";

/**
 * Design tokens live in two places and stay in sync:
 *  - CSS custom properties in src/app/globals.css (runtime source of truth)
 *  - this file (Tailwind class surface)
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1.5rem", lg: "2rem" },
      screens: { "2xl": "1200px" },
    },
    extend: {
      colors: {
        ink: "var(--ink)",
        panel: "var(--panel)",
        raised: "var(--raised)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        paper: "var(--paper)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        signal: "var(--signal)",
        ember: "var(--ember)",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        eyebrow: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.14em" }],
        display: ["clamp(2.5rem, 6vw, 4.25rem)", { lineHeight: "1.02", letterSpacing: "-0.035em" }],
        title: ["clamp(1.75rem, 3.4vw, 2.5rem)", { lineHeight: "1.1", letterSpacing: "-0.028em" }],
      },
      borderRadius: {
        card: "14px",
        panel: "18px",
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 20px 50px -30px rgba(0,0,0,0.9)",
        lift: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 30px 70px -40px rgba(0,0,0,1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        pulseNode: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.22s ease-out",
        "accordion-up": "accordion-up 0.22s ease-out",
        node: "pulseNode 3.2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
