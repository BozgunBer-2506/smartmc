export type {
  AttachmentType,
  AuthenticationResult,
  CapabilityManifest,
  CredentialValidationResult,
  IngestionMode,
  NormalizedMessage,
  OutboundMessage,
  SendResult,
  SyncCheckpoint,
  SyncResult,
} from "./types";

export { defineCapabilityManifest, requiresReconciliation } from "./capability-manifest";

export {
  ConnectorLifecycle,
  IllegalLifecycleTransitionError,
  LIFECYCLE_STATES,
  LIFECYCLE_TRANSITIONS,
  checkLifecycleGraphIntegrity,
} from "./lifecycle";
export type { LifecycleState, LifecycleTransitionListener, LifecycleTransitionRecord } from "./lifecycle";

export { ConnectorError, redactCredentials } from "./errors";
export type { ConnectorErrorCode } from "./errors";

export { BaseConnector } from "./connector";
export type { Connector } from "./connector";

export { ConnectorRegistry } from "./registry";

export { MockConnector, MOCK_PROVIDER_KEY, generateMockMessage, mockConnector } from "./mock-connector";
export type { GenerateMockMessageOptions } from "./mock-connector";

export { MOCK_ERROR_FIXTURES, MOCK_MESSAGE_FIXTURES } from "./mock-connector.fixtures";

export { certifyConnector } from "./certification";
export type {
  CertificationCheckResult,
  CertificationErrorFixture,
  CertificationOptions,
  CertificationReport,
} from "./certification";
