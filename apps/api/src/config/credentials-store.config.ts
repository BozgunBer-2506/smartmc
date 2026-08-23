import { scryptSync } from "node:crypto";

/**
 * Config for the interim secrets store (ADR-0016), now with key-rotation
 * support: `CREDENTIALS_ENCRYPTION_KEY` is version 1, an optional
 * `CREDENTIALS_ENCRYPTION_KEY_V2` is version 2, each a 64-character hex
 * string (32 bytes, AES-256). `CREDENTIALS_ENCRYPTION_ACTIVE_VERSION`
 * picks which version `putSecret` encrypts new secrets with (defaults to
 * the highest configured version) - existing rows keep decrypting under
 * whatever version they were written with (`SecretRecord.keyVersion`).
 *
 * In production, a missing/malformed key fails fast at startup (via
 * `assertValid()`, called from `main.ts`) rather than silently falling
 * back to a value hardcoded in this public repo. The dev-only derived key
 * below only ever runs when `NODE_ENV !== "production"` - a runtime check,
 * not just a comment - so it can never reach a real deployment even if the
 * env var is accidentally left unset there.
 */
const DEV_KEY_MATERIAL = "dev-insecure-credentials-key-change-me";
const KEY_ENV_PREFIX = "CREDENTIALS_ENCRYPTION_KEY";

function parseKey(envVarName: string, hex: string): Buffer {
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(`${envVarName} must decode to exactly 32 bytes (64 hex characters) for AES-256-GCM, got ${key.length} bytes.`);
  }
  return key;
}

function loadKeyRing(): Map<number, Buffer> {
  const ring = new Map<number, Buffer>();

  const v1 = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (v1) ring.set(1, parseKey("CREDENTIALS_ENCRYPTION_KEY", v1));

  const v2 = process.env.CREDENTIALS_ENCRYPTION_KEY_V2;
  if (v2) ring.set(2, parseKey("CREDENTIALS_ENCRYPTION_KEY_V2", v2));

  if (ring.size === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CREDENTIALS_ENCRYPTION_KEY is not set. Refusing to start in production without a real encryption key - " +
          "the hardcoded development fallback must never be used to encrypt a real credential.",
      );
    }
    // eslint-disable-next-line no-console
    console.warn(
      "CREDENTIALS_ENCRYPTION_KEY is not set - using a derived, insecure dev-only key. " +
        "Set a real 64-character hex value before storing any real credential.",
    );
    ring.set(1, scryptSync(DEV_KEY_MATERIAL, "smc-secrets-dev-salt", 32));
  }

  return ring;
}

let cachedRing: Map<number, Buffer> | undefined;

function ring(): Map<number, Buffer> {
  if (!cachedRing) cachedRing = loadKeyRing();
  return cachedRing;
}

export const credentialsStoreConfig = {
  /** Throws immediately if production has no real key configured - call once at boot, not lazily on first use. */
  assertValid(): void {
    ring();
  },

  activeVersion(): number {
    const configured = process.env.CREDENTIALS_ENCRYPTION_ACTIVE_VERSION;
    if (configured) return Number(configured);
    return Math.max(...ring().keys());
  },

  encryptionKeyForVersion(version: number): Buffer {
    const key = ring().get(version);
    if (!key) {
      throw new Error(
        `No encryption key configured for version ${version} (expected an env var like ${KEY_ENV_PREFIX}${version > 1 ? `_V${version}` : ""}).`,
      );
    }
    return key;
  },
};
