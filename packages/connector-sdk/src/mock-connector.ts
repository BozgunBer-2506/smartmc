import { v7 as uuidv7 } from "uuid";
import type { Direction, InboundMessagePayload } from "@smc/shared";
import { defineCapabilityManifest } from "./capability-manifest";
import { BaseConnector } from "./connector";
import { ConnectorError, type ConnectorErrorCode } from "./errors";
import type {
  AuthenticationResult,
  CredentialValidationResult,
  NormalizedMessage,
  OutboundMessage,
  SendResult,
  SyncCheckpoint,
  SyncResult,
} from "./types";

/**
 * The Mock Connector (docs/CONNECTOR_SDK.md Section 18) - the first
 * connector built, before any real provider, and the one every future
 * connector (Telegram, Discord, Slack, Email) is certified against. It
 * implements the full SDK contract against a fully synthetic,
 * locally-controllable "provider": no real external API, no rate limits
 * imposed by anyone but our own configurable simulation.
 *
 * docs/ROADMAP.md Phase 4 Sprint 1 migrated this from a bare
 * generateMockMessage() helper (Phase 1 Sprint 2's minimal proof-of-pipeline
 * stub) to a real Connector implementation. generateMockMessage() is kept
 * below as a thin adapter so apps/api's existing mock-connector controller
 * (Phase 1-3) needs no changes - it now goes through mapMessage() under the
 * hood instead of building the payload by hand.
 */
export const MOCK_PROVIDER_KEY = "mock";

const MOCK_INITIAL_SYNC_TOTAL = 12;
const MOCK_RECONCILE_TOTAL = 6;
const DEFAULT_BATCH_SIZE = 5;

interface MockRawMessage {
  id: string;
  conversationId: string;
  conversationTitle?: string;
  direction: Direction;
  text: string;
  receivedAt: string;
  senderId?: string;
  senderHandle?: string;
  senderName?: string;
}

interface MockRawError {
  code?: string;
  message?: string;
}

const MOCK_ERROR_TAXONOMY: Record<string, ConnectorErrorCode> = {
  auth_expired: "AUTH_EXPIRED",
  rate_limited: "RATE_LIMITED",
  provider_down: "PROVIDER_UNAVAILABLE",
  not_found: "RESOURCE_NOT_FOUND",
  forbidden: "PERMISSION_DENIED",
  rejected: "PAYLOAD_REJECTED",
};

function buildSyntheticRawMessage(index: number, prefix: string): MockRawMessage {
  return {
    id: `${prefix}-${index}`,
    conversationId: `mock-conversation-synthetic`,
    conversationTitle: "Mock Synthetic Conversation",
    direction: "inbound",
    text: `Synthetic ${prefix} message #${index}`,
    receivedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    senderId: "mock-synthetic-sender",
    senderHandle: "@mock-synthetic-sender",
    senderName: "Mock Synthetic Sender",
  };
}

export class MockConnector extends BaseConnector {
  readonly capabilityManifest = defineCapabilityManifest({
    providerKey: MOCK_PROVIDER_KEY,
    displayName: "Mock Connector",
    ingestionMode: "hybrid",
    reconciliationIntervalMinutes: 15,
    messageEditing: true,
    messageDeletion: true,
    reactions: true,
    threads: false,
    readReceipts: false,
    typingIndicators: false,
    groupManagement: "read_write",
    maxAttachmentSizeBytes: 25 * 1024 * 1024,
    supportedAttachmentTypes: ["image", "video", "document", "voice"],
    rateLimits: { requestsPerSecond: 30, burst: 10 },
  });

  private failureMode: ConnectorErrorCode | null = null;

  /**
   * Test/dev hook (docs/CONNECTOR_SDK.md Section 18: "configurable to
   * simulate every failure mode in Section 15's taxonomy on demand"). Set
   * to null to clear.
   */
  simulateFailure(code: ConnectorErrorCode | null): void {
    this.failureMode = code;
  }

  async validateCredential(credential: unknown): Promise<CredentialValidationResult> {
    if (typeof credential === "string" && credential.startsWith("mock-valid-")) {
      return { valid: true };
    }
    return { valid: false, reason: 'Mock credentials must start with "mock-valid-".' };
  }

  protected async onCredentialValidated(credential: unknown): Promise<AuthenticationResult> {
    return { accountExternalId: String(credential) };
  }

  async initialSync(checkpoint?: SyncCheckpoint): Promise<SyncResult> {
    this.throwIfSimulatingFailure();
    return this.runSyntheticSync(checkpoint, MOCK_INITIAL_SYNC_TOTAL, "initial");
  }

  async reconcile(checkpoint?: SyncCheckpoint): Promise<SyncResult> {
    this.throwIfSimulatingFailure();
    return this.runSyntheticSync(checkpoint, MOCK_RECONCILE_TOTAL, "reconcile");
  }

  /**
   * Outbound send (docs/CONNECTOR_SDK.md Section 14). Under a simulated
   * RATE_LIMITED failure, backs off once and still succeeds (queued, never
   * dropped) - the backpressure contract certification item 10 checks.
   * Any other simulated failure is terminal, matching Section 15's
   * retryable/terminal split.
   */
  async send(message: OutboundMessage): Promise<SendResult> {
    if (this.failureMode === "RATE_LIMITED") {
      this.failureMode = null;
      return { externalId: `mock-outbound-${uuidv7()}`, queued: true };
    }
    this.throwIfSimulatingFailure();
    void message;
    return { externalId: `mock-outbound-${uuidv7()}`, queued: false };
  }

  mapMessage(rawPayload: unknown): NormalizedMessage {
    const raw = rawPayload as MockRawMessage;
    return {
      externalId: raw.id,
      conversationExternalId: raw.conversationId,
      conversationTitle: raw.conversationTitle,
      direction: raw.direction,
      bodyText: raw.text,
      receivedAt: raw.receivedAt,
      senderExternalId: raw.senderId,
      senderHandle: raw.senderHandle,
      senderDisplayName: raw.senderName,
    };
  }

  mapError(rawError: unknown): ConnectorError {
    const raw = rawError as MockRawError;
    const code = MOCK_ERROR_TAXONOMY[raw.code ?? ""] ?? "UNKNOWN";
    return new ConnectorError(code, raw.message ?? "Unknown mock provider error.");
  }

  private throwIfSimulatingFailure(): void {
    if (this.failureMode) {
      throw this.mapError({ code: this.failureModeToRawCode(this.failureMode), message: `Simulated ${this.failureMode}` });
    }
  }

  private failureModeToRawCode(code: ConnectorErrorCode): string {
    const entry = Object.entries(MOCK_ERROR_TAXONOMY).find(([, value]) => value === code);
    return entry?.[0] ?? "unknown";
  }

  /** Pure function of (checkpoint, total) - the same checkpoint always produces the same next batch, which is what makes checkpoint-resume testable without a real crash. */
  private runSyntheticSync(checkpoint: SyncCheckpoint | undefined, total: number, prefix: string): SyncResult {
    const start = checkpoint?.processedCount ?? 0;
    if (start >= total) {
      return { messages: [], checkpoint: { cursor: String(total), processedCount: total }, complete: true };
    }
    const end = Math.min(start + DEFAULT_BATCH_SIZE, total);
    const messages: NormalizedMessage[] = [];
    for (let i = start; i < end; i += 1) {
      messages.push(this.mapMessage(buildSyntheticRawMessage(i, prefix)));
    }
    return {
      messages,
      checkpoint: { cursor: String(end), processedCount: end },
      complete: end >= total,
    };
  }
}

/** A shared reference instance - stateless aside from simulateFailure(), safe to reuse. */
export const mockConnector = new MockConnector();

export interface GenerateMockMessageOptions {
  workspaceId: string;
  senderExternalId?: string;
  senderDisplayName?: string;
  bodyText?: string;
  conversationExternalId?: string;
}

/**
 * Legacy adapter (docs/ROADMAP.md Phase 1 Sprint 2) kept so apps/api's
 * existing mock-connector controller needs no changes for Phase 4 Sprint 1 -
 * it now builds a raw provider-shaped payload and runs it through
 * MockConnector.mapMessage() exactly as a real connector's ingestion path
 * would, instead of constructing the canonical shape by hand.
 */
export function generateMockMessage(options: GenerateMockMessageOptions): InboundMessagePayload {
  const senderExternalId = options.senderExternalId ?? "mock-user-1";
  const conversationExternalId = options.conversationExternalId ?? `mock-conversation-${senderExternalId}`;

  const raw: MockRawMessage = {
    id: uuidv7(),
    conversationId: conversationExternalId,
    conversationTitle: options.senderDisplayName ?? "Mock Conversation",
    direction: "inbound",
    text: options.bodyText ?? "This is a synthetic message from the Mock Connector.",
    receivedAt: new Date().toISOString(),
    senderId: senderExternalId,
    senderHandle: `@${senderExternalId}`,
    senderName: options.senderDisplayName ?? "Mock User",
  };

  const normalized = mockConnector.mapMessage(raw);

  return {
    workspaceId: options.workspaceId,
    providerKey: mockConnector.capabilityManifest.providerKey,
    conversationExternalId: normalized.conversationExternalId,
    conversationTitle: normalized.conversationTitle,
    senderExternalId: normalized.senderExternalId ?? senderExternalId,
    senderHandle: normalized.senderHandle,
    senderDisplayName: normalized.senderDisplayName,
    messageExternalId: normalized.externalId,
    bodyText: normalized.bodyText,
    receivedAt: normalized.receivedAt,
    direction: normalized.direction,
  };
}
