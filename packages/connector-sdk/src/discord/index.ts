export { DiscordConnector, DISCORD_PROVIDER_KEY, type DiscordCredential } from "./discord-connector";
export { RealDiscordApiClient, DiscordRawApiError } from "./discord-api-client";
export type { DiscordApiClient } from "./discord-api-client";
export { connectDiscordGateway } from "./discord-gateway-client";
export type { DiscordGatewayHandle } from "./discord-gateway-client";
export type {
  DiscordAttachment,
  DiscordChannel,
  DiscordGuild,
  DiscordMessage,
  DiscordUser,
  GatewayPayload,
} from "./discord.types";
export { GatewayOpcode } from "./discord.types";
export { DISCORD_ERROR_FIXTURES, DISCORD_MESSAGE_FIXTURES } from "./discord.fixtures";
