import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { defaultConnectorRegistry, EMAIL_PROVIDER_KEY, type EmailConnector, type EmailCredential } from "@smc/connector-sdk";
import { getPrismaClient } from "@smc/database";
import { createEvent, EventType } from "@smc/event-model";
import type { InboundMessagePayload } from "@smc/shared";
import { emailConfig } from "../config/email.config";
import { CredentialsStoreService } from "../credentials-store/credentials-store.service";
import { EventsService } from "../events/events.service";

/**
 * The *primary* ingestion path for every connected mailbox - not a
 * backstop the way Telegram/Discord/Slack's *ReconciliationService
 * classes are. `"polling"` ingestion (`CONNECTOR_SDK.md` Section 4.2)
 * has no webhook to fall back on; this interval loop is the only way a
 * new email is ever discovered, cursor-based via `EmailConnector`'s own
 * durable IMAP-UID checkpoint (Section 9) so a restart mid-cycle
 * resumes rather than re-ingesting or skipping.
 */
@Injectable()
export class EmailPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailPollingService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly eventsService: EventsService,
    private readonly credentialsStore: CredentialsStoreService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => this.logger.error(`Email poll sweep failed: ${(err as Error).message}`));
    }, emailConfig.pollIntervalMs());
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<void> {
    const prisma = getPrismaClient();
    const connector = defaultConnectorRegistry.get(EMAIL_PROVIDER_KEY) as EmailConnector;

    const accounts = await prisma.linkedAccount.findMany({
      where: { status: { in: ["active", "degraded"] }, provider: { key: EMAIL_PROVIDER_KEY } },
    });

    for (const account of accounts) {
      try {
        const raw = await this.credentialsStore.getSecret(account.credentialsRef);
        const credential = JSON.parse(raw) as EmailCredential;
        const result = await connector.reconcile(
          { cursor: account.syncCursor, processedCount: 0 },
          { credential, linkedAccountId: account.id },
        );

        for (const message of result.messages) {
          const payload: InboundMessagePayload = {
            workspaceId: account.workspaceId,
            providerKey: EMAIL_PROVIDER_KEY,
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
            producer: `connector-worker:${EMAIL_PROVIDER_KEY}:poll`,
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
          this.logger.log(`Poll ingested ${result.messages.length} message(s) for LinkedAccount ${account.id}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Poll failed for LinkedAccount ${account.id}: ${message}`);
        await prisma.linkedAccount.update({
          where: { id: account.id },
          data: { lastError: message, status: "degraded" },
        });
      }
    }
  }
}
