import type { Direction } from "@smc/shared";

/**
 * The provider-agnostic ingestion posture (docs/CONNECTOR_SDK.md Section 4).
 * "webhook" alone is never a valid steady-state for a webhook-capable
 * provider - see capability-manifest.ts's validation, which enforces
 * Section 4.3's hybrid-by-default requirement.
 */
export type IngestionMode = "webhook" | "polling" | "hybrid";

export type AttachmentType = "image" | "video" | "document" | "voice" | "other";

/**
 * A connector's Capability Manifest (docs/CONNECTOR_SDK.md Section 5) -
 * published at registration time so the platform (UI, Automation Engine)
 * can query what a provider actually supports instead of special-casing
 * each provider by name.
 */
export interface CapabilityManifest {
  providerKey: string;
  displayName: string;
  ingestionMode: IngestionMode;
  /**
   * Required whenever ingestionMode is "webhook" or "hybrid" (docs/CONNECTOR_SDK.md
   * Section 4.3) - the reconciliation pass interval, in minutes.
   */
  reconciliationIntervalMinutes?: number;
  messageEditing: boolean;
  messageDeletion: boolean;
  reactions: boolean;
  threads: boolean;
  readReceipts: boolean;
  typingIndicators: boolean;
  groupManagement: "read_write" | "read_only";
  maxAttachmentSizeBytes: number;
  supportedAttachmentTypes: AttachmentType[];
  rateLimits: {
    requestsPerSecond: number;
    burst: number;
  };
}

/**
 * The canonical, provider-agnostic message shape a connector's mapper
 * produces (docs/CONNECTOR_SDK.md Section 11). This is the SDK-level
 * contract; apps/api adapts it into the platform's InboundMessagePayload
 * (docs/DATABASE.md Section 6.8's Message shape) for the event bus.
 */
export interface NormalizedMessage {
  /** The provider's own message identifier - never generated locally (Section 10's dedup contract). */
  externalId: string;
  conversationExternalId: string;
  conversationTitle?: string;
  direction: Direction;
  bodyText: string;
  /** Rich-format body, if the provider has one. Never fabricated for a plain-text-only provider. */
  bodyRich?: unknown;
  receivedAt: string;
  /** Best-effort (Section 11) - falls back to receivedAt if the provider doesn't distinguish send vs. receive time. */
  sentAt?: string;
  senderExternalId?: string;
  senderHandle?: string;
  senderDisplayName?: string;
}

export interface SyncCheckpoint {
  cursor: string | null;
  processedCount: number;
}

export interface SyncResult {
  messages: NormalizedMessage[];
  checkpoint: SyncCheckpoint;
  /** True once this sync pass (initial backfill or reconciliation) has reached its bound. */
  complete: boolean;
}

export interface CredentialValidationResult {
  valid: boolean;
  reason?: string;
}

export interface AuthenticationResult {
  accountExternalId: string;
}

export interface OutboundMessage {
  conversationExternalId: string;
  bodyText: string;
}

export interface SendResult {
  externalId: string;
  /** True if the send was queued/retried due to provider rate limiting rather than sent immediately - never means "dropped" (docs/CONNECTOR_SDK.md Section 14's backpressure-not-drop contract). */
  queued: boolean;
}
