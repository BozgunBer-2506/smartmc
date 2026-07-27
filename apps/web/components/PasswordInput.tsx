"use client";

import { useState } from "react";

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
 */
export function PasswordInput({ value, onChange, placeholder, required, minLength, containerStyle, hint }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...containerStyle }}>
      <div style={{ position: "relative" }}>
        <input
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, width: "100%", paddingRight: 52 }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          style={toggleStyle}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {hint && <span style={{ fontSize: 11, color: "#6B7686" }}>{hint}</span>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 6,
  border: "1px solid #2A3441",
  background: "#111726",
  color: "#F5F7FA",
  fontSize: 14,
};

const toggleStyle: React.CSSProperties = {
  position: "absolute",
  right: 8,
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  color: "#9AA5B1",
  fontSize: 12,
  cursor: "pointer",
  padding: 4,
};
