/**
 * Canonical domain types shared across apps/packages.
 *
 * This is a deliberately minimal subset of the full model specified in
 * docs/DATABASE.md - it grows as later phases need more of that spec
 * implemented, not all at once. See docs/DATABASE.md Section 6 for the
 * authoritative, full schema this will eventually match in full.
 */

/** Fixed dev workspace id - Phase 1 has no auth/workspace-creation flow yet (docs/ROADMAP.md Phase 2). Shared between apps/api and apps/web so both sides agree on it without duplicating the literal. */
export const DEV_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

export type Direction = "inbound" | "outbound";

export interface Workspace {
  id: string;
  name: string;
  timezone: string;
}

export interface Provider {
  id: string;
  key: string;
  displayName: string;
}

export interface Contact {
  id: string;
  workspaceId: string;
  displayName: string;
  isVip: boolean;
}

export interface ContactIdentity {
  id: string;
  contactId: string;
  providerId: string;
  externalId: string;
  handle: string | null;
  matchType: "exact" | "confirmed_manual";
}

export interface Conversation {
  id: string;
  workspaceId: string;
  providerId: string;
  externalId: string;
  title: string | null;
}

export interface Message {
  id: string;
  workspaceId: string;
  conversationId: string;
  externalId: string;
  senderContactId: string | null;
  direction: Direction;
  bodyText: string;
  receivedAt: string;
}

export interface Notification {
  id: string;
  workspaceId: string;
  messageId: string | null;
  type: "message" | "reminder" | "digest" | "system";
  title: string;
  body: string;
  createdAt: string;
}

/** A canonical, provider-agnostic inbound message, as produced by a Connector (docs/CONNECTOR_SDK.md Section 11) before IdentityGraph resolution. */
export interface InboundMessagePayload {
  workspaceId: string;
  providerKey: string;
  conversationExternalId: string;
  conversationTitle?: string;
  senderExternalId: string;
  senderHandle?: string;
  senderDisplayName?: string;
  messageExternalId: string;
  bodyText: string;
  receivedAt: string;
}
