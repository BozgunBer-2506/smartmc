import { randomBytes } from "node:crypto";
import { Body, Controller, Headers, HttpStatus, Logger, Param, Post, UseGuards } from "@nestjs/common";
import {
  defaultConnectorRegistry,
  TELEGRAM_PROVIDER_KEY,
  type LifecycleState,
  type TelegramConnector,
  type TelegramUpdate,
} from "@smc/connector-sdk";
import { getPrismaClient, newId } from "@smc/database";
import { createEvent, EventType } from "@smc/event-model";
import type { InboundMessagePayload } from "@smc/shared";
import { AuditLogService } from "../audit/audit-log.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { telegramConfig } from "../config/telegram.config";
import { httpError } from "../common/http-error";
import { EventsService } from "../events/events.service";
import { CredentialsStoreService } from "../credentials-store/credentials-store.service";
import { TelegramApiService } from "./telegram-api.service";

interface ConnectTelegramDto {
  botToken?: string;
}

/**
 * The Telegram connector's platform surface (docs/ROADMAP.md Phase 4
 * Sprint 2): connecting a real bot, receiving its webhook, and
 * disconnecting it. The ingestion-cycle logic itself (validateCredential,
 * initialSync, reconcile, mapMessage, mapError) lives in
 * packages/connector-sdk's TelegramConnector, looked up through the
 * Connector Registry - this controller is the NestJS/Postgres/secrets
 * orchestration around it, not a second copy of connector logic.
 */
@Controller("connectors/telegram")
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly credentialsStore: CredentialsStoreService,
    private readonly auditLogService: AuditLogService,
    private readonly telegramApi: TelegramApiService,
  ) {}

  private get connector(): TelegramConnector {
    return defaultConnectorRegistry.get(TELEGRAM_PROVIDER_KEY) as TelegramConnector;
  }

  @Post("connect")
  @UseGuards(JwtAuthGuard)
  async connect(@Body() dto: ConnectTelegramDto, @CurrentUser() claims: JwtPayload) {
    if (!dto.botToken || typeof dto.botToken !== "string") {
      throw httpError(HttpStatus.BAD_REQUEST, "BOT_TOKEN_REQUIRED", "A Telegram bot token is required.");
    }
    const botToken = dto.botToken;

    // Section 3.2: a credential is never accepted and stored on faith - a
    // real getMe call must succeed first.
    const validation = await this.connector.validateCredential(botToken);
    if (!validation.valid) {
      throw httpError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "INVALID_BOT_TOKEN",
        validation.reason ?? "Telegram rejected this bot token.",
      );
    }

    const auth = await this.connector.authenticate(botToken);
    const prisma = getPrismaClient();

    const provider = await prisma.provider.upsert({
      where: { key: TELEGRAM_PROVIDER_KEY },
      update: {},
      create: { id: newId(), key: TELEGRAM_PROVIDER_KEY, displayName: "Telegram" },
    });

    const existing = await prisma.linkedAccount.findFirst({
      where: { workspaceId: claims.workspaceId, providerId: provider.id, externalAccountId: auth.accountExternalId },
    });
    if (existing) {
      throw httpError(
        HttpStatus.CONFLICT,
        "LINKED_ACCOUNT_ALREADY_EXISTS",
        "This Telegram bot is already connected to your workspace.",
      );
    }

    const { ref: credentialsRef } = await this.credentialsStore.putSecret(botToken);
    const webhookSecret = randomBytes(32).toString("hex");

    const linkedAccount = await prisma.linkedAccount.create({
      data: {
        id: newId(),
        workspaceId: claims.workspaceId,
        providerId: provider.id,
        externalAccountId: auth.accountExternalId,
        status: "registered",
        credentialsRef,
        webhookSecret,
      },
    });

    // Lifecycle: registered -> authenticating -> syncing_initial -> active.
    // Section 2's table has no direct authenticating -> active edge, so
    // syncing_initial is always visited, even though ADR-0017 makes it a
    // real, instant no-op for Telegram.
    const lifecycle = this.connector.createLifecycle();
    lifecycle.transition("authenticating");
    lifecycle.transition("syncing_initial");
    await this.connector.initialSync(undefined, { credential: botToken, linkedAccountId: linkedAccount.id });
    lifecycle.transition("active");

    let webhookRegistered = false;
    const webhookBaseUrl = telegramConfig.webhookBaseUrl();
    if (webhookBaseUrl) {
      try {
        const webhookUrl = `${webhookBaseUrl.replace(/\/$/, "")}/v1/connectors/telegram/webhook/${linkedAccount.id}`;
        await this.telegramApi.setWebhook(botToken, webhookUrl, webhookSecret);
        webhookRegistered = true;
      } catch (err) {
        // Non-fatal: reconciliation (ADR-0017) keeps checking and will
        // recover once the webhook can be registered - the account
        // still works via getUpdates-based reconciliation in the meantime.
        this.logger.warn(`setWebhook failed for LinkedAccount ${linkedAccount.id}: ${(err as Error).message}`);
      }
    }

    await prisma.linkedAccount.update({
      where: { id: linkedAccount.id },
      data: { status: lifecycle.current, lastSyncedAt: new Date() },
    });

    await this.auditLogService.log({
      workspaceId: claims.workspaceId,
      actorUserId: claims.sub,
      actorType: "user",
      action: "connector.telegram.connected",
      resourceType: "linked_account",
      resourceId: linkedAccount.id,
      metadata: { externalAccountId: auth.accountExternalId, webhookRegistered },
    });

    return {
      id: linkedAccount.id,
      status: lifecycle.current,
      providerKey: TELEGRAM_PROVIDER_KEY,
      externalAccountId: auth.accountExternalId,
      webhookRegistered,
    };
  }

  /**
   * Telegram's webhook receiver - public (Telegram can't present a user
   * JWT), authenticated instead via the per-LinkedAccount secret token
   * Telegram echoes back in a header on every call (set at connect time
   * via setWebhook's secret_token). Responds fast (Telegram expects a
   * quick 200) and defers real work to the existing event pipeline -
   * exactly the same message.received path the Mock Connector uses.
   */
  @Post("webhook/:linkedAccountId")
  async webhook(
    @Param("linkedAccountId") linkedAccountId: string,
    @Body() update: TelegramUpdate,
    @Headers("x-telegram-bot-api-secret-token") secretHeader: string | undefined,
  ) {
    const prisma = getPrismaClient();
    const linkedAccount = await prisma.linkedAccount.findUnique({ where: { id: linkedAccountId } });

    // A 200, not a 404/401: an unknown or already-disconnected account
    // must not make Telegram treat this endpoint as failing and retry
    // forever (docs/CONNECTOR_SDK.md Section 6's heartbeat/health design
    // is about our own health signal, not Telegram's retry behavior).
    if (!linkedAccount || linkedAccount.deletedAt) {
      return { ok: true };
    }
    if (!linkedAccount.webhookSecret || secretHeader !== linkedAccount.webhookSecret) {
      throw httpError(HttpStatus.UNAUTHORIZED, "INVALID_WEBHOOK_SECRET", "Webhook secret token mismatch.");
    }

    if (!update.message && !update.edited_message) {
      return { ok: true }; // an update type we don't ingest yet (e.g. a status update) - not an error
    }

    const normalized = this.connector.mapMessage(update);
    const payload: InboundMessagePayload = {
      workspaceId: linkedAccount.workspaceId,
      providerKey: TELEGRAM_PROVIDER_KEY,
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
      producer: `connector-worker:${TELEGRAM_PROVIDER_KEY}`,
      workspaceId: linkedAccount.workspaceId,
      payload,
    });
    await this.eventsService.publish(event);

    return { ok: true };
  }

  @Post(":id/disconnect")
  @UseGuards(JwtAuthGuard)
  async disconnect(@Param("id") id: string, @CurrentUser() claims: JwtPayload) {
    const prisma = getPrismaClient();
    const linkedAccount = await prisma.linkedAccount.findFirst({ where: { id, workspaceId: claims.workspaceId } });
    if (!linkedAccount) {
      throw httpError(HttpStatus.NOT_FOUND, "LINKED_ACCOUNT_NOT_FOUND", "Linked account not found.");
    }

    const lifecycle = this.connector.createLifecycle(undefined, linkedAccount.status as LifecycleState);
    lifecycle.transition("disconnecting");

    const botToken = await this.credentialsStore.getSecret(linkedAccount.credentialsRef).catch(() => undefined);
    if (botToken) {
      await this.telegramApi.deleteWebhook(botToken).catch(() => undefined);
    }
    // SECURITY.md Section 5.2: unconditional deletion, regardless of
    // whether the provider-side call above succeeded.
    await this.credentialsStore.deleteSecret(linkedAccount.credentialsRef);

    lifecycle.transition("disconnected");
    await prisma.linkedAccount.update({
      where: { id: linkedAccount.id },
      data: { status: lifecycle.current, deletedAt: new Date() },
    });

    await this.auditLogService.log({
      workspaceId: claims.workspaceId,
      actorUserId: claims.sub,
      actorType: "user",
      action: "connector.telegram.disconnected",
      resourceType: "linked_account",
      resourceId: linkedAccount.id,
    });

    return { id: linkedAccount.id, status: lifecycle.current };
  }
}
