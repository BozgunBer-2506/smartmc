import type { CapabilityManifest } from "./types";

/**
 * Validates and returns a Capability Manifest (docs/CONNECTOR_SDK.md Section 5).
 * Every connector must construct its manifest through this function, not a
 * bare object literal - it is what enforces Section 4.3's hybrid-by-default
 * requirement ("a connector submitted for certification without a
 * reconciliation pass does not pass certification, regardless of how solid
 * its webhook handling is on its own") at manifest-declaration time, before
 * a single message is ever ingested.
 */
export function defineCapabilityManifest(manifest: CapabilityManifest): CapabilityManifest {
  if (
    (manifest.ingestionMode === "webhook" || manifest.ingestionMode === "hybrid") &&
    !manifest.reconciliationIntervalMinutes
  ) {
    throw new Error(
      `Capability manifest for provider "${manifest.providerKey}" declares ingestionMode ` +
        `"${manifest.ingestionMode}" but no reconciliationIntervalMinutes. Every webhook-capable ` +
        `connector must also run a reconciliation pass (docs/CONNECTOR_SDK.md Section 4.3) - ` +
        `webhook-only is not a supported connector type on its own.`,
    );
  }

  if (manifest.rateLimits.requestsPerSecond <= 0) {
    throw new Error(
      `Capability manifest for provider "${manifest.providerKey}" declares a non-positive ` +
        `rateLimits.requestsPerSecond - a connector must declare its actual provider rate limit ` +
        `(docs/CONNECTOR_SDK.md Section 5), not leave it unset.`,
    );
  }

  return manifest;
}

/** True when a manifest requires a reconciliation pass per Section 4.3. */
export function requiresReconciliation(manifest: CapabilityManifest): boolean {
  return manifest.ingestionMode === "webhook" || manifest.ingestionMode === "hybrid";
}
