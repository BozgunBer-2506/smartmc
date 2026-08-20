"use client";

import { useState } from "react";
import { Input } from "@smc/ui";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  /** Applied to the outermost wrapper - use for flex sizing (e.g. `{ flex: "1 1 160px" }`) since that's the actual flex item in the parent row, not the nested <input>. */
  containerStyle?: React.CSSProperties;
  hint?: string;
}

/**
 * A password field with a Show/Hide toggle - extracted from AuthForm.tsx
 * so the Email connector's own password field (Inbox.tsx) gets the same
 * affordance, not a second, inconsistent copy (docs UI audit, 2026-07-27:
 * a masked credential with no way to confirm what was typed).
 *
 * Migrated onto the design system (docs/ROADMAP.md Phase 22.2) - the
 * underlying field is now the shared `Input` primitive, not a local style
 * object.
 */
export function PasswordInput({ value, onChange, placeholder, required, minLength, containerStyle, hint }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1" style={containerStyle}>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pr-[52px]"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-text-secondary hover:text-text-primary focus-visible:outline-none"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {hint && <span className="text-[11px] text-text-disabled">{hint}</span>}
    </div>
  );
}
