"use client";

import { useState } from "react";
import { Alert, Button, Card, Input } from "@smc/ui";
import { login, register, type AuthResponse } from "../lib/api";
import { PasswordInput } from "./PasswordInput";

interface AuthFormProps {
  onAuthenticated: (result: AuthResponse) => void;
}

/**
 * Login/register form (docs/ROADMAP.md Phase 3's demo script, steps 1-2).
 * Migrated onto the design system (docs/ROADMAP.md Phase 22.2) - the
 * product's entry point, and a small enough surface to validate the
 * Card/Input/Button/Alert combination in real use before the two bigger
 * screens. Same content and flow as before - login/register toggle,
 * password policy hint, error handling - no redesign.
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
    <main className="mx-auto mt-20 max-w-[420px] p-6">
      <Card className="p-6">
        <h1 className="mb-1 text-xl font-semibold text-text-primary">Smart Message Center</h1>
        <p className="mb-6 text-[13px] text-text-secondary">
          {mode === "register" ? "Create an account to get started." : "Log in to your account."}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          {mode === "register" && (
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Name (optional)" />
          )}
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <PasswordInput
            value={password}
            onChange={setPassword}
            required
            minLength={mode === "register" ? 12 : undefined}
            placeholder={mode === "register" ? "Password (12+ characters)" : "Password"}
          />

          {error && <Alert variant="danger">{error}</Alert>}

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
          className="mt-4 border-none bg-transparent text-[13px] text-text-secondary underline hover:text-text-primary"
        >
          {mode === "register" ? "Already have an account? Log in" : "Need an account? Register"}
        </button>
      </Card>
    </main>
  );
}
