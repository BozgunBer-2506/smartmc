import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { defaultConnectorRegistry, TELEGRAM_PROVIDER_KEY, type TelegramConnector } from "@smc/connector-sdk";
import { getPrismaClient } from "@smc/database";
import { createEvent, EventType } from "@smc/event-model";
import type { InboundMessagePayload } from "@smc/shared";
import { telegramConfig } from "../config/telegram.config";
import { CredentialsStoreService } from "../credentials-store/credentials-store.service";
import { EventsService } from "../events/events.service";

/**
 * The periodic half of ADR-0017's reconciliation strategy - runs
 * TelegramConnector.reconcile() for every active LinkedAccount on an
 * interval (docs/CONNECTOR_SDK.md Section 4.3), publishing anything the
 * drain recovers through the same event pipeline the webhook uses.
 */
@Injectable()
export class TelegramReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramReconciliationService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly eventsService: EventsService,
    private readonly credentialsStore: CredentialsStoreService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => this.logger.error(`Reconciliation sweep failed: ${(err as Error).message}`));
    }, telegramConfig.reconciliationIntervalMs());
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<void> {
    const prisma = getPrismaClient();
    const connector = defaultConnectorRegistry.get(TELEGRAM_PROVIDER_KEY) as TelegramConnector;

    const accounts = await prisma.linkedAccount.findMany({
      where: { status: { in: ["active", "degraded"] }, provider: { key: TELEGRAM_PROVIDER_KEY } },
    });

    for (const account of accounts) {
      try {
        const token = await this.credentialsStore.getSecret(account.credentialsRef);
        const result = await connector.reconcile(
          { cursor: account.syncCursor, processedCount: 0 },
          { credential: token, linkedAccountId: account.id, metadata: { webhookSecret: account.webhookSecret ?? "" } },
        );

        for (const message of result.messages) {
          const payload: InboundMessagePayload = {
            workspaceId: account.workspaceId,
            providerKey: TELEGRAM_PROVIDER_KEY,
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
            producer: `connector-worker:${TELEGRAM_PROVIDER_KEY}:reconciliation`,
            workspaceId: account.workspaceId,
            payload,
          });
          await this.eventsService.publish(event);
        }

        await prisma.linkedAccount.update({
          where: { id: account.id },
          data: { syncCursor: result.checkpoint.cursor, lastSyncedAt: new Date(), lastError: null, status: "active" },
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
