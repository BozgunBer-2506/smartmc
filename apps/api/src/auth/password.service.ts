import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { createHash } from "node:crypto";

const MIN_PASSWORD_LENGTH = 12; // SECURITY.md Section 4.1 - length over complexity rules
const MAX_PASSWORD_LENGTH = 128; // prevents a pathologically large input to Argon2

@Injectable()
export class PasswordService {
  /** Argon2id specifically - never bcrypt/SHA-family, per SECURITY.md Section 4.1. */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  validatePolicy(password: string): string[] {
    const errors: string[] = [];
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      errors.push(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long.`);
    }
    return errors;
  }

  /**
   * Have I Been Pwned k-anonymity range check (SECURITY.md Section 4.1) -
   * only the first 5 hex characters of the password's SHA-1 hash ever
   * leave this process; the plaintext password never does. SHA-1 is used
   * here deliberately because it's HIBP's documented API contract, not a
   * choice about how *we* store anything - password storage is Argon2id
   * only, above.
   *
   * Fails open (returns false = "not known-breached") on any network
   * error or timeout: registration must never depend on a third party's
   * uptime.
   */
  async isKnownBreached(password: string): Promise<boolean> {
    try {
      const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      let response: Response;
      try {
        response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) return false;

      const body = await response.text();
      return body.split("\n").some((line) => line.split(":")[0]?.trim() === suffix);
    } catch {
      return false;
    }
  }
}
