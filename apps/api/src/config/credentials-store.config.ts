import { scryptSync } from "node:crypto";

/**
 * Config for the interim secrets store (ADR-0016), matching this
 * codebase's existing env-with-documented-defaults pattern (auth.config.ts).
 * `CREDENTIALS_ENCRYPTION_KEY` must be a 64-character hex string (32 bytes,
 * AES-256). If unset, a deterministic dev-only key is derived so local
 * development works out of the box - loudly not safe for anything beyond
 * a laptop, since it's derivable by anyone who reads this file.
 */
const DEV_KEY_MATERIAL = "dev-insecure-credentials-key-change-me";

let cachedKey: Buffer | undefined;

export const credentialsStoreConfig = {
  encryptionKey(): Buffer {
    if (cachedKey) return cachedKey;

    const configured = process.env.CREDENTIALS_ENCRYPTION_KEY;
    if (!configured) {
      // eslint-disable-next-line no-console
      console.warn(
        "CREDENTIALS_ENCRYPTION_KEY is not set - using a derived, insecure dev-only key. " +
          "Set a real 64-character hex value before storing any real credential.",
      );
      cachedKey = scryptSync(DEV_KEY_MATERIAL, "smc-secrets-dev-salt", 32);
      return cachedKey;
    }

    const key = Buffer.from(configured, "hex");
    if (key.length !== 32) {
      throw new Error(
        `CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex characters) for AES-256-GCM, got ${key.length} bytes.`,
      );
    }
    cachedKey = key;
    return cachedKey;
  },
};
