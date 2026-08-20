/** Spacing (docs/DESIGN_SYSTEM.md Section 6) - a 4px base unit. Tailwind's own default spacing scale is already 4px-based (1 = 0.25rem = 4px, 2 = 0.5rem = 8px, ...), so this documents the mapping rather than overriding Tailwind's config. */
export const spacing = {
  1: "0.25rem", // 4px
  2: "0.5rem", // 8px
  3: "0.75rem", // 12px
  4: "1rem", // 16px
  5: "1.5rem", // 24px
  6: "2rem", // 32px
  8: "3rem", // 48px
  10: "4rem", // 64px
};

/** Radius scale - not previously specified in docs/DESIGN_SYSTEM.md; derived from the values already in consistent use across Inbox.tsx/Rules.tsx/ConnectorManagement.tsx before this phase (cards at 8px, inputs/buttons at 6px, small buttons at 4px). */
export const radius = {
  sm: "4px",
  md: "6px",
  lg: "8px",
  full: "9999px",
};

/** docs/DESIGN_SYSTEM.md Section 14 - motion is purposeful only, one consistent duration/easing token, `prefers-reduced-motion` respected globally rather than per-component. */
export const motion = {
  duration: "180ms",
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
};

/** Product had no real shadow scale before this phase - only one ad hoc value (the Inbox toast). Kept as `md`, `sm`/`lg` added for the new Dialog/Tooltip primitives' elevation needs. */
export const shadows = {
  sm: "0 1px 3px rgba(0, 0, 0, 0.2)",
  md: "0 4px 12px rgba(0, 0, 0, 0.3)",
  lg: "0 12px 32px rgba(0, 0, 0, 0.4)",
};

/** docs/DESIGN_SYSTEM.md Section 8 - standard Tailwind breakpoints, deliberately not customized, replacing the ad hoc `@media (max-width: 720px)` block independently duplicated in Inbox.tsx/Rules.tsx/ConnectorManagement.tsx before this phase. */
export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
};
