import type { ConnectorErrorCode } from "../errors";

export interface CertificationErrorFixture {
  raw: unknown;
  expectedCode: ConnectorErrorCode;
  /** If present, this literal string must not appear anywhere in the mapped ConnectorError's message. */
  secretInMessage?: string;
}

export interface CertificationOptions {
  /** Fixed, deterministic raw provider payloads (Section 16 item 13) to run through mapMessage(). */
  messageFixtures: readonly unknown[];
  /** Simulated raw provider errors to run through mapError(), with the expected taxonomy code. */
  errorFixtures: readonly CertificationErrorFixture[];
  validCredential: unknown;
  invalidCredential: unknown;
}

export interface CertificationCheckResult {
  name: string;
  passed: boolean;
  /** True when this check could not run for this connector (e.g. it exposes no failure-simulation hook) - not a failure, but not verified either. */
  skipped?: boolean;
  detail?: string;
}

export interface CertificationReport {
  providerKey: string;
  results: readonly CertificationCheckResult[];
  passed: boolean;
}
