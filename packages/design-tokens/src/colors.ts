/**
 * Semantic color tokens (docs/DESIGN_SYSTEM.md Section 4) - implemented for
 * the first time in Phase 22. Dark values keep the product's existing
 * identity (the exact hex values already used across Inbox.tsx/Rules.tsx/
 * ConnectorManagement.tsx before this phase), rather than picking new ones -
 * light values are new, derived to meet the same semantic role.
 *
 * Two real inconsistencies found during the Phase 22 audit are resolved
 * here, not carried forward: `success` had two different greens (#3FB27F
 * vs #4CAF87) and `danger` had two different reds (#E05252 vs #E05858)
 * across those three files - each is now the single value below. `warning`
 * previously reused the same hex as `accentPriority` (ConnectorManagement's
 * "degraded" status) - docs/DESIGN_SYSTEM.md Section 4.1 states these must
 * be visually distinct hues, not just shades, so a VIP/priority signal is
 * never confusable with a "this connector needs attention" signal; warning
 * is now a distinct mustard-gold rather than a second amber.
 */
export interface ColorTokens {
  backgroundBase: string;
  surface1: string;
  surface2: string;
  borderSubtle: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  accentPriority: string;
  statusSuccess: string;
  statusWarning: string;
  statusDanger: string;
  statusInfo: string;
}

export const darkColors: ColorTokens = {
  backgroundBase: "#0B0F17",
  surface1: "#111726",
  surface2: "#161E2C",
  borderSubtle: "#2A3441",
  borderStrong: "#3D4A5C",
  textPrimary: "#F5F7FA",
  textSecondary: "#9AA5B1",
  textDisabled: "#6B7686",
  accentPriority: "#E0A458",
  statusSuccess: "#3FB27F",
  statusWarning: "#C9A227",
  statusDanger: "#E05252",
  statusInfo: "#5B8DEF",
};

export const lightColors: ColorTokens = {
  backgroundBase: "#F7F8FA",
  surface1: "#FFFFFF",
  surface2: "#F1F3F6",
  borderSubtle: "#E2E5EA",
  borderStrong: "#B7BEC7",
  textPrimary: "#12151C",
  textSecondary: "#5B6472",
  textDisabled: "#A2A9B3",
  accentPriority: "#B9791F",
  statusSuccess: "#1F8F5F",
  statusWarning: "#8A6D1B",
  statusDanger: "#C23A3A",
  statusInfo: "#3A6BC7",
};

/** Provider badge colors (docs/DESIGN_SYSTEM.md Section 4.2) - the one deliberate exception to "no provider-specific visuals," bounded to the small badge element only. Same values in both themes - low-saturation enough to read on either background. */
export const providerColors: Record<string, { label: string; background: string; foreground: string }> = {
  telegram: { label: "Telegram", background: "#1B3A52", foreground: "#5FB9E8" },
  discord: { label: "Discord", background: "#2B2A4A", foreground: "#8B8FF7" },
  slack: { label: "Slack", background: "#3A2440", foreground: "#D186DA" },
  email: { label: "Email", background: "#2A2E1F", foreground: "#B8C46B" },
  mock: { label: "Mock", background: "#2A3441", foreground: "#9AA5B1" },
  default: { label: "Unknown", background: "#2A3441", foreground: "#9AA5B1" },
};
