"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "./use-theme";

const CYCLE: ThemePreference[] = ["system", "light", "dark"];
const ICONS: Record<ThemePreference, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };
const LABELS: Record<ThemePreference, string> = { system: "System theme", light: "Light theme", dark: "Dark theme" };

/** A small, single-button theme control (docs/ROADMAP.md Phase 22) - cycles system -> light -> dark -> system, never a bigger settings panel. */
export function ThemeToggle() {
  const { preference, setTheme } = useTheme();
  // Avoids a server/client icon mismatch: the server has no localStorage to read, so it always renders the "system" icon - swap to the real preference only after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = mounted ? preference : "system";
  const Icon = ICONS[current];
  const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]!;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`${LABELS[current]} - switch to ${LABELS[next].toLowerCase()}`}
      title={LABELS[current]}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-surface-1 text-text-secondary transition-colors hover:text-text-primary"
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}
