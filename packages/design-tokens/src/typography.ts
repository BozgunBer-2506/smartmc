/** Type scale (docs/DESIGN_SYSTEM.md Section 5) - each entry is one indivisible unit (size, weight, line-height) so a size is never reused with an ad hoc line-height. */
export interface TypeScaleEntry {
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
  letterSpacing?: string;
  textTransform?: "uppercase";
}

export const typeScale: Record<string, TypeScaleEntry> = {
  display: { fontSize: "1.75rem", lineHeight: "2.1rem", fontWeight: 600 },
  heading1: { fontSize: "1.375rem", lineHeight: "1.75rem", fontWeight: 600 },
  heading2: { fontSize: "1.0625rem", lineHeight: "1.5rem", fontWeight: 600 },
  body: { fontSize: "0.9375rem", lineHeight: "1.5rem", fontWeight: 400 },
  bodyEmphasis: { fontSize: "0.9375rem", lineHeight: "1.5rem", fontWeight: 500 },
  caption: { fontSize: "0.8125rem", lineHeight: "1.25rem", fontWeight: 400 },
  label: { fontSize: "0.75rem", lineHeight: "1rem", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" },
  mono: { fontSize: "0.8125rem", lineHeight: "1.25rem", fontWeight: 400 },
};

/** docs/DESIGN_SYSTEM.md Section 5 - Inter for UI chrome/content, a monospace face reserved for automation/rule-builder contexts only. */
export const fontFamilies = {
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
};
