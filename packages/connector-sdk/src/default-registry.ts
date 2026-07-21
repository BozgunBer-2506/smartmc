import { DiscordConnector } from "./discord/discord-connector";
import { mockConnector } from "./mock-connector";
import { ConnectorRegistry } from "./registry";
import { TelegramConnector } from "./telegram/telegram-connector";

/**
 * The platform's actual connector registry (docs/ROADMAP.md Phase 4
 * checklist item: "Connector registry - how the platform discovers/loads
 * connectors"). apps/api looks connectors up through this, by provider
 * key, rather than importing a specific connector class directly - the
 * whole point of the registry existing.
 */
export const defaultConnectorRegistry = new ConnectorRegistry();
defaultConnectorRegistry.register(mockConnector);
defaultConnectorRegistry.register(new TelegramConnector());
defaultConnectorRegistry.register(new DiscordConnector());
