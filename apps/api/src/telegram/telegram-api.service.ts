import { Injectable } from "@nestjs/common";
import { RealTelegramApiClient, type TelegramApiClient, type TelegramMessage, type TelegramUpdate, type TelegramUser, type TelegramWebhookInfo } from "@smc/connector-sdk";

/**
 * An injectable NestJS wrapper around the SDK's RealTelegramApiClient, for
 * platform-orchestration calls that aren't part of the generic Connector
 * interface (registering/tearing down a webhook at connect/disconnect
 * time) - the Connector interface itself stays provider-agnostic and only
 * covers the ingestion-cycle calls (validateCredential, initialSync,
 * reconcile, send), which TelegramConnector makes through its own
 * internal client.
 */
@Injectable()
export class TelegramApiService implements TelegramApiClient {
  private readonly client = new RealTelegramApiClient();

  getMe(token: string): Promise<TelegramUser> {
    return this.client.getMe(token);
  }

  sendMessage(token: string, chatId: string, text: string): Promise<TelegramMessage> {
    return this.client.sendMessage(token, chatId, text);
  }

  setWebhook(token: string, url: string, secretToken: string): Promise<void> {
    return this.client.setWebhook(token, url, secretToken);
  }

  deleteWebhook(token: string): Promise<void> {
    return this.client.deleteWebhook(token);
  }

  getWebhookInfo(token: string): Promise<TelegramWebhookInfo> {
    return this.client.getWebhookInfo(token);
  }

  getUpdates(token: string, offset?: number, timeoutSeconds?: number): Promise<TelegramUpdate[]> {
    return this.client.getUpdates(token, offset, timeoutSeconds);
  }
}
