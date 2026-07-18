import { ConnectorError } from "./errors";
import { ConnectorLifecycle, type LifecycleTransitionListener } from "./lifecycle";
import type {
  AuthenticationResult,
  CapabilityManifest,
  CredentialValidationResult,
  NormalizedMessage,
  OutboundMessage,
  SendResult,
  SyncCheckpoint,
  SyncResult,
} from "./types";

/**
 * The contract every connector implements (docs/CONNECTOR_SDK.md Sections
 * 2, 3, 5, 8, 9, 11, 15). This is what "I'll write a Signal connector"
 * means concretely - conformance to this interface, verified by the
 * certification suite (certification/certify.ts), is what makes a
 * connector eligible for the platform, not familiarity with the internal
 * codebase.
 */
export interface Connector {
  readonly capabilityManifest: CapabilityManifest;

  /**
   * Makes one real, minimal call to the provider to confirm a credential
   * actually works (docs/CONNECTOR_SDK.md Section 3.2) - a connector never
   * accepts a credential on faith.
   */
  validateCredential(credential: unknown): Promise<CredentialValidationResult>;

  /**
   * The only path to a validated account. Implementations must call
   * validateCredential internally and reject before any persistence -
   * see BaseConnector, which implements this ordering guarantee once so
   * individual connectors cannot skip it.
   */
  authenticate(credential: unknown): Promise<AuthenticationResult>;

  /**
   * Bounded backfill (docs/CONNECTOR_SDK.md Section 8.1). Resumable: called
   * again with the checkpoint from a previous, incomplete result, it
   * continues rather than restarting from zero.
   */
  initialSync(checkpoint?: SyncCheckpoint): Promise<SyncResult>;

  /**
   * The hybrid pattern's periodic correctness backstop (docs/CONNECTOR_SDK.md
   * Section 4.3 / 8.3) - required for any connector whose manifest declares
   * "webhook" or "hybrid" ingestion.
   */
  reconcile(checkpoint?: SyncCheckpoint): Promise<SyncResult>;

  /**
   * A pure function: the same raw provider payload always produces the
   * same canonical output (docs/CONNECTOR_SDK.md Section 11).
   */
  mapMessage(rawPayload: unknown): NormalizedMessage;

  /** Maps a provider-native error into the standardized taxonomy (Section 15). */
  mapError(rawError: unknown): ConnectorError;

  /** A fresh lifecycle state machine for one LinkedAccount (Section 2). */
  createLifecycle(listener?: LifecycleTransitionListener): ConnectorLifecycle;

  /**
   * Outbound send (docs/CONNECTOR_SDK.md Section 14) - optional because not
   * every connector implementation exists yet, but required to produce
   * backpressure (queue/retry), never a silent drop, wherever implemented.
   */
  send?(message: OutboundMessage): Promise<SendResult>;
}

/**
 * Base implementation every connector should extend. It exists specifically
 * to make Section 3.2's ordering guarantee ("never accepts and stores an
 * unverified credential") structural rather than a convention every
 * connector author has to remember: `authenticate()` is implemented once,
 * here, and always calls `validateCredential()` first - a subclass supplies
 * `onCredentialValidated` (what to do once validation has already
 * succeeded), not `authenticate` itself.
 */
export abstract class BaseConnector implements Connector {
  abstract readonly capabilityManifest: CapabilityManifest;

  abstract validateCredential(credential: unknown): Promise<CredentialValidationResult>;
  abstract initialSync(checkpoint?: SyncCheckpoint): Promise<SyncResult>;
  abstract reconcile(checkpoint?: SyncCheckpoint): Promise<SyncResult>;
  abstract mapMessage(rawPayload: unknown): NormalizedMessage;
  abstract mapError(rawError: unknown): ConnectorError;

  async authenticate(credential: unknown): Promise<AuthenticationResult> {
    const result = await this.validateCredential(credential);
    if (!result.valid) {
      throw new ConnectorError("AUTH_EXPIRED", result.reason ?? "Credential validation failed.");
    }
    return this.onCredentialValidated(credential);
  }

  /** Called only after validateCredential has already succeeded. */
  protected abstract onCredentialValidated(credential: unknown): Promise<AuthenticationResult>;

  createLifecycle(listener?: LifecycleTransitionListener): ConnectorLifecycle {
    return new ConnectorLifecycle(listener);
  }
}
