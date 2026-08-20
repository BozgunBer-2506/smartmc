"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "smc-theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

function getStored(): ResolvedTheme | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" ? value : null;
}

function getSystemPreference(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Theme state (docs/ROADMAP.md Phase 22) - a manual `data-theme` override
 * (persisted to `localStorage`) that wins over `prefers-color-scheme`,
 * which is otherwise followed live (a system preference change while the
 * app is open, and no manual override is stored, updates the theme without
 * a reload). Pairs with `THEME_NO_FLASH_SCRIPT` (no-flash-script.ts), which
 * applies whatever's already in `localStorage` before this hook's first
 * render.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => getStored() ?? "system");
  const [resolved, setResolved] = useState<ResolvedTheme>(() => getStored() ?? getSystemPreference());

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    function apply() {
      const stored = getStored();
      const next = stored ?? (mediaQuery.matches ? "dark" : "light");
      setResolved(next);
      document.documentElement.setAttribute("data-theme", next);
    }
    apply();
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
    if (next === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  return { preference, resolved, setTheme };
}
