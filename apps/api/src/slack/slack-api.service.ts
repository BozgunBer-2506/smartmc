import { Injectable } from "@nestjs/common";
import { RealSlackApiClient, type SlackApiClient, type SlackChannel, type SlackMessage, type SlackOAuthAccessResponse } from "@smc/connector-sdk";

/**
 * An injectable NestJS wrapper around the SDK's RealSlackApiClient, for the
 * one platform-orchestration call that isn't part of the generic Connector
 * interface: the OAuth v2 code exchange at connect time - the same reason
 * TelegramApiService exists for setWebhook/deleteWebhook. SlackConnector
 * itself never does this exchange; it only ever receives an already-issued
 * bot token via ConnectorContext.
 */
@Injectable()
export class SlackApiService implements SlackApiClient {
  private readonly client = new RealSlackApiClient();

  authTest(botToken: string): Promise<{ teamId: string; team: string; userId: string }> {
    return this.client.authTest(botToken);
  }

  listConversations(botToken: string): Promise<SlackChannel[]> {
    return this.client.listConversations(botToken);
  }

  conversationsHistory(botToken: string, channel: string, cursor?: string, limit?: number): Promise<{ messages: SlackMessage[]; nextCursor?: string }> {
    return this.client.conversationsHistory(botToken, channel, cursor, limit);
  }

  postMessage(botToken: string, channel: string, text: string): Promise<{ ts: string; channel: string }> {
    return this.client.postMessage(botToken, channel, text);
  }

  oauthV2Access(clientId: string, clientSecret: string, code: string, redirectUri: string): Promise<SlackOAuthAccessResponse> {
    return this.client.oauthV2Access(clientId, clientSecret, code, redirectUri);
  }
}
