/**
 * Transactional-email provider configuration (Resend integration). Matches
 * this codebase's existing env-with-documented-defaults pattern
 * (auth.config.ts, telegram.config.ts) plus the fail-fast-at-boot pattern
 * credentials-store.config.ts established for a different secret.
 *
 * Deliberately stricter than "no provider configured": an operator who
 * sets TRANSACTIONAL_EMAIL_PROVIDER to something is asserting a specific
 * deployment intent, and getting it wrong (a typo, a half-filled-in
 * Resend key) must be loud and immediate, not silently downgraded to the
 * "unconfigured" state - that state is reserved for the genuinely
 * not-yet-configured case (TRANSACTIONAL_EMAIL_PROVIDER unset), which
 * remains a supported, non-fatal deployment state for now.
 */
export type TransactionalEmailProviderConfig =
  | { provider: "unconfigured" }
  | { provider: "resend"; apiKey: string; from: string };

function resolve(): TransactionalEmailProviderConfig {
  const raw = process.env.TRANSACTIONAL_EMAIL_PROVIDER?.trim();

  if (!raw) {
    return { provider: "unconfigured" };
  }

  if (raw === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.TRANSACTIONAL_EMAIL_FROM;
    const missing: string[] = [];
    if (!apiKey) missing.push("RESEND_API_KEY");
    if (!from) missing.push("TRANSACTIONAL_EMAIL_FROM");
    if (missing.length > 0) {
      // Names only, never values - satisfies "error message may name the
      // missing variable name(s), must never contain their values."
      throw new Error(
        `TRANSACTIONAL_EMAIL_PROVIDER=resend requires ${missing.join(" and ")} to be set. Refusing to start with an incomplete provider configuration.`,
      );
    }
    return { provider: "resend", apiKey: apiKey as string, from: from as string };
  }

  // An unsupported value is a configuration error, not a typo the app
  // should silently tolerate - the value itself is a plain enum-like
  // string (not a secret), so it's safe and useful to name in the error.
  throw new Error(
    `Unsupported TRANSACTIONAL_EMAIL_PROVIDER value: "${raw}". Supported values: "resend", or leave the variable unset.`,
  );
}

let cached: TransactionalEmailProviderConfig | undefined;

export const transactionalEmailConfig = {
  /** Throws immediately on misconfiguration - call once at boot (main.ts), not lazily on first request. */
  assertValid(): void {
    cached = resolve();
  },

  get(): TransactionalEmailProviderConfig {
    if (!cached) cached = resolve();
    return cached;
  },
};
