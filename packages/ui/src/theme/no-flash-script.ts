/**
 * Inline, pre-hydration script (docs/ROADMAP.md Phase 22) - embedded via
 * `dangerouslySetInnerHTML` in `apps/web/app/layout.tsx`'s `<head>`, so it
 * runs before first paint. Only acts when a manual override is stored -
 * the no-preference case is already flash-free on its own, since
 * `@media (prefers-color-scheme: dark)` in globals.css is resolved by the
 * browser's CSS engine before paint, with no JS timing dependency at all.
 * This script exists specifically for the case that CSS alone can't
 * handle: a stored preference that *contradicts* the OS setting (e.g. the
 * system is dark but the user picked light) - without it, the page would
 * paint the system theme first, then flip once React hydrates.
 */
export const THEME_NO_FLASH_SCRIPT = `(function(){try{var t=localStorage.getItem("smc-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
