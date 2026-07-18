import { v7 as uuidv7 } from "uuid";
import type { InboundMessagePayload } from "@smc/shared";

/**
 * The Mock Connector (docs/CONNECTOR_SDK.md Section 18) - the first
 * connector built, before any real provider. Phase 1 Sprint 2 uses it to
 * prove the entire ingestion pipeline end-to-end with synthetic data.
 *
 * This is intentionally not a full CONNECTOR_SDK.md-conformant connector
 * yet (no lifecycle state machine, no capability manifest, no certification
 * suite - docs/ROADMAP.md Phase 4 scope). It only implements the one thing
 * Phase 1's vertical slice needs: producing a canonical inbound message
 * payload, exactly as a real connector's mapper would (docs/CONNECTOR_SDK.md
 * Section 11).
 */
export const MOCK_PROVIDER_KEY = "mock";

export interface GenerateMockMessageOptions {
  workspaceId: string;
  senderExternalId?: string;
  senderDisplayName?: string;
  bodyText?: string;
  conversationExternalId?: string;
}

export function generateMockMessage(
  options: GenerateMockMessageOptions,
): InboundMessagePayload {
  const senderExternalId = options.senderExternalId ?? "mock-user-1";
  return {
    workspaceId: options.workspaceId,
    providerKey: MOCK_PROVIDER_KEY,
    conversationExternalId:
      options.conversationExternalId ?? `mock-conversation-${senderExternalId}`,
    conversationTitle: options.senderDisplayName ?? "Mock Conversation",
    senderExternalId,
    senderHandle: `@${senderExternalId}`,
    senderDisplayName: options.senderDisplayName ?? "Mock User",
    messageExternalId: uuidv7(),
    bodyText: options.bodyText ?? "This is a synthetic message from the Mock Connector.",
    receivedAt: new Date().toISOString(),
  };
}
