"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Card } from "@smc/ui";
import { resetPassword } from "../lib/api";
import { PasswordInput } from "./PasswordInput";

/**
 * The landing page for a password-reset email's link (Auth Reliability
 * Hardening). Standalone - works whether or not the visitor currently has
 * a session at `/`, since the link comes from outside the app. The token
 * only ever leaves this page in the reset POST's JSON body, never in a
 * query string sent to the API (docs/SECURITY.md - never logged).
 */
export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!token) {
      setError("This password reset link is invalid or has expired.");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto mt-20 max-w-[420px] p-6">
      <Card className="p-6">
        <h1 className="mb-1 text-xl font-semibold text-text-primary">Reset your password</h1>

        {!token ? (
          <>
            <p className="mb-4 mt-4 text-[13px] text-text-secondary">This password reset link is invalid or has expired.</p>
            <a href="/" className="text-[13px] text-text-secondary underline hover:text-text-primary">
              Back to log in
            </a>
          </>
        ) : done ? (
          <>
            <Alert variant="success" className="mt-4">
              Your password has been reset. You can now log in with your new password.
            </Alert>
            <a href="/" className="mt-4 inline-block text-[13px] text-text-secondary underline hover:text-text-primary">
              Back to log in
            </a>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2.5">
            <PasswordInput value={newPassword} onChange={setNewPassword} required minLength={12} placeholder="New password (12+ characters)" />
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword} required minLength={12} placeholder="Confirm new password" />

            {error && <Alert variant="danger">{error}</Alert>}

            <Button type="submit" disabled={submitting}>
              {submitting ? "Please wait..." : "Reset password"}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
