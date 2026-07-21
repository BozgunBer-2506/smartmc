import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  defaultConnectorRegistry,
  DISCORD_PROVIDER_KEY,
  type DiscordConnector,
  type StreamHandle,
} from "@smc/connector-sdk";
import { getPrismaClient, type LinkedAccount } from "@smc/database";
import { createEvent, EventType } from "@smc/event-model";
import type { InboundMessagePayload } from "@smc/shared";
import { CredentialsStoreService } from "../credentials-store/credentials-store.service";
import { EventsService } from "../events/events.service";

/**
 * Owns every active Discord LinkedAccount's persistent Gateway connection
 * (ADR-0019) - a real, stateful, in-process resource the webhook-shaped
 * Telegram connector never needed. Starts a StreamHandle per active
 * account on boot and on connect; stops it on disconnect. Each raw
 * MESSAGE_CREATE the Gateway delivers is normalized and published through
 * the same event pipeline the webhook and mock-connector paths use.
 */
@Injectable()
export class DiscordGatewayManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordGatewayManagerService.name);
  private readonly handles = new Map<string, StreamHandle>();

  constructor(
    private readonly eventsService: EventsService,
    private readonly credentialsStore: CredentialsStoreService,
  ) {}

  async onModuleInit(): Promise<void> {
    const prisma = getPrismaClient();
    const accounts = await prisma.linkedAccount.findMany({
      where: { status: { in: ["active", "degraded"] }, provider: { key: DISCORD_PROVIDER_KEY } },
    });
    for (const account of accounts) {
      await this.start(account).catch((err) =>
        this.logger.warn(`Failed to resume Gateway for LinkedAccount ${account.id}: ${(err as Error).message}`),
      );
    }
  }

  async start(linkedAccount: LinkedAccount): Promise<void> {
    if (this.handles.has(linkedAccount.id)) return;

    const botToken = await this.credentialsStore.getSecret(linkedAccount.credentialsRef);
    const connector = defaultConnectorRegistry.get(DISCORD_PROVIDER_KEY) as DiscordConnector;

    if (!connector.startListening) {
      throw new Error("DiscordConnector does not implement startListening() - cannot start the Gateway.");
    }

    const handle = await connector.startListening(
      { credential: { botToken, guildId: linkedAccount.externalAccountId }, linkedAccountId: linkedAccount.id },
      (rawPayload) => {
        this.handleRawMessage(linkedAccount, connector, rawPayload).catch((err) =>
          this.logger.error(`Failed to ingest a Discord Gateway message for LinkedAccount ${linkedAccount.id}: ${(err as Error).message}`),
        );
      },
    );

    this.handles.set(linkedAccount.id, handle);
    this.logger.log(`Discord Gateway connected for LinkedAccount ${linkedAccount.id}`);
  }

  async stop(linkedAccountId: string): Promise<void> {
    const handle = this.handles.get(linkedAccountId);
    if (!handle) return;
    await handle.stop();
    this.handles.delete(linkedAccountId);
  }

  private async handleRawMessage(linkedAccount: LinkedAccount, connector: DiscordConnector, rawPayload: unknown): Promise<void> {
    const normalized = connector.mapMessage(rawPayload);
    const payload: InboundMessagePayload = {
      workspaceId: linkedAccount.workspaceId,
      providerKey: DISCORD_PROVIDER_KEY,
      conversationExternalId: normalized.conversationExternalId,
      conversationTitle: normalized.conversationTitle,
      senderExternalId: normalized.senderExternalId ?? normalized.conversationExternalId,
      senderHandle: normalized.senderHandle,
      senderDisplayName: normalized.senderDisplayName,
      messageExternalId: normalized.externalId,
      bodyText: normalized.bodyText,
      receivedAt: normalized.receivedAt,
      direction: normalized.direction,
      linkedAccountId: linkedAccount.id,
    };

    const event = createEvent({
      type: EventType.MESSAGE_RECEIVED,
      producer: `connector-worker:${DISCORD_PROVIDER_KEY}`,
      workspaceId: linkedAccount.workspaceId,
      payload,
    });
    await this.eventsService.publish(event);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.handles.values()].map((handle) => handle.stop().catch(() => undefined)));
    this.handles.clear();
  }
}
