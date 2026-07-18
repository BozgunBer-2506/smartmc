"use client";

import { useState } from "react";
import { Button } from "@smc/ui";
import { login, register, type AuthResponse } from "../lib/api";

interface AuthFormProps {
  onAuthenticated: (result: AuthResponse) => void;
}

/**
 * Minimal, unstyled-but-functional login/register form (docs/ROADMAP.md
 * Phase 3's demo script, steps 1-2). Not built against DESIGN_SYSTEM.md/
 * UI_GUIDE.md - that's later, deliberate scope; this exists to make the
 * demo script something a real person can click through in a browser.
 */
export function AuthForm({ onAuthenticated }: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === "register" ? await register(email, password, displayName || undefined) : await login(email, password);
      onAuthenticated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Smart Message Center</h1>
      <p style={{ color: "#9AA5B1", fontSize: 13, marginBottom: 24 }}>
        {mode === "register" ? "Create an account to get started." : "Log in to your account."}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {mode === "register" && (
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Name (optional)"
            style={inputStyle}
          />
        )}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          style={inputStyle}
        />
        <input
          type="password"
          required
          minLength={mode === "register" ? 12 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "register" ? "Password (12+ characters)" : "Password"}
          style={inputStyle}
        />

        {error && <p style={{ color: "#E05252", fontSize: 13 }}>{error}</p>}

        <Button type="submit" disabled={submitting}>
          {submitting ? "Please wait..." : mode === "register" ? "Register" : "Log in"}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "register" ? "login" : "register");
          setError(null);
        }}
        style={{
          marginTop: 16,
          background: "none",
          border: "none",
          color: "#9AA5B1",
          fontSize: 13,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        {mode === "register" ? "Already have an account? Log in" : "Need an account? Register"}
      </button>
    </main>
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
