import type { Connector } from "./connector";

/**
 * How the platform discovers/loads connectors (docs/ROADMAP.md Phase 4
 * checklist). Deliberately simple - an in-process registry keyed by
 * provider key. A connector marketplace's dynamic loading (docs/ROADMAP.md
 * Phase 18) is a different, much later problem; this is what apps/api
 * needs today to look up "the connector for provider X" without a
 * hardcoded switch statement per call site.
 */
export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();

  register(connector: Connector): void {
    const key = connector.capabilityManifest.providerKey;
    if (this.connectors.has(key)) {
      throw new Error(`A connector for provider "${key}" is already registered.`);
    }
    this.connectors.set(key, connector);
  }

  get(providerKey: string): Connector {
    const connector = this.connectors.get(providerKey);
    if (!connector) {
      throw new Error(`No connector registered for provider "${providerKey}".`);
    }
    return connector;
  }

  has(providerKey: string): boolean {
    return this.connectors.has(providerKey);
  }

  list(): readonly Connector[] {
    return [...this.connectors.values()];
  }
}
