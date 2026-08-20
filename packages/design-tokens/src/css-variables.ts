import { darkColors, lightColors, type ColorTokens } from "./colors";

/** camelCase token key -> `--color-kebab-case` CSS custom property name. */
function cssVarName(key: string): string {
  return `--color-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

function colorDeclarations(tokens: ColorTokens): string {
  return (Object.keys(tokens) as (keyof ColorTokens)[])
    .map((key) => `  ${cssVarName(key)}: ${tokens[key]};`)
    .join("\n");
}

/**
 * Generates the CSS custom-property block `apps/web/app/globals.css` embeds
 * verbatim (docs/DESIGN_SYSTEM.md Section 17: tokens and their CSS
 * variables are "expected to stay in lockstep" - copied by hand rather than
 * built at Next.js config time, since globals.css is a static file Next
 * serves directly, not run through this package's own build step).
 *
 * Three blocks, matching the three states a theme can be in:
 * - `:root` - the light palette, the unauthenticated/no-preference default.
 * - `@media (prefers-color-scheme: dark)`, guarded by `:not([data-theme="light"])`
 *   so a manual light override always wins over the OS preference.
 * - `[data-theme="dark"]` - the manual override, wins in both directions.
 */
export function generateThemeCss(): string {
  return `:root {
${colorDeclarations(lightColors)}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${colorDeclarations(darkColors)}
  }
}

:root[data-theme="dark"] {
${colorDeclarations(darkColors)}
}
`;
}
