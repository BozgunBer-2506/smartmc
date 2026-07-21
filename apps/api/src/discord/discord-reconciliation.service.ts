import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { defaultConnectorRegistry, DISCORD_PROVIDER_KEY, type DiscordConnector } from "@smc/connector-sdk";
import { getPrismaClient } from "@smc/database";
import { createEvent, EventType } from "@smc/event-model";
import type { InboundMessagePayload } from "@smc/shared";
import { discordConfig } from "../config/discord.config";
import { CredentialsStoreService } from "../credentials-store/credentials-store.service";
import { EventsService } from "../events/events.service";

/**
 * The periodic reconciliation pass ADR-0019 still requires for Discord's
 * "streaming" ingestion mode, exactly like Telegram's (ADR-0017) but
 * implemented for real this time - Discord's channel-history endpoint
 * makes a genuine list-and-diff pass possible (CONNECTOR_SDK.md Section
 * 4.3), catching anything a Gateway disconnect might have missed.
 */
@Injectable()
export class DiscordReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordReconciliationService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly eventsService: EventsService,
    private readonly credentialsStore: CredentialsStoreService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => this.logger.error(`Reconciliation sweep failed: ${(err as Error).message}`));
    }, discordConfig.reconciliationIntervalMs());
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<void> {
    const prisma = getPrismaClient();
    const connector = defaultConnectorRegistry.get(DISCORD_PROVIDER_KEY) as DiscordConnector;

    const accounts = await prisma.linkedAccount.findMany({
      where: { status: { in: ["active", "degraded"] }, provider: { key: DISCORD_PROVIDER_KEY } },
    });

    for (const account of accounts) {
      try {
        const botToken = await this.credentialsStore.getSecret(account.credentialsRef);
        const result = await connector.reconcile(
          { cursor: account.syncCursor, processedCount: 0 },
          { credential: { botToken, guildId: account.externalAccountId }, linkedAccountId: account.id },
        );

        for (const message of result.messages) {
          const payload: InboundMessagePayload = {
            workspaceId: account.workspaceId,
            providerKey: DISCORD_PROVIDER_KEY,
            conversationExternalId: message.conversationExternalId,
            conversationTitle: message.conversationTitle,
            senderExternalId: message.senderExternalId ?? message.conversationExternalId,
            senderHandle: message.senderHandle,
            senderDisplayName: message.senderDisplayName,
            messageExternalId: message.externalId,
            bodyText: message.bodyText,
            receivedAt: message.receivedAt,
            direction: message.direction,
            linkedAccountId: account.id,
          };
          const event = createEvent({
            type: EventType.MESSAGE_RECEIVED,
            producer: `connector-worker:${DISCORD_PROVIDER_KEY}:reconciliation`,
            workspaceId: account.workspaceId,
            payload,
          });
          await this.eventsService.publish(event);
        }

        // Reconciliation walks channels one page per cycle (DiscordConnector.syncChannels);
        // once it has walked every known channel, restart from the beginning next cycle.
        await prisma.linkedAccount.update({
          where: { id: account.id },
          data: {
            syncCursor: result.complete ? null : result.checkpoint.cursor,
            lastSyncedAt: new Date(),
            lastError: null,
            status: "active",
          },
        });

        if (result.messages.length > 0) {
          this.logger.log(`Reconciliation recovered ${result.messages.length} message(s) for LinkedAccount ${account.id}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Reconciliation failed for LinkedAccount ${account.id}: ${message}`);
        await prisma.linkedAccount.update({
          where: { id: account.id },
          data: { lastError: message, status: "degraded" },
        });
      }
    }
  }
}
