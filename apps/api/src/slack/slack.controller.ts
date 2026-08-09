import { createHmac, timingSafeEqual } from "node:crypto";
import { Controller, Get, HttpStatus, Logger, Param, Post, Query, RawBodyRequest, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { defaultConnectorRegistry, isSlackContentMessage, SLACK_PROVIDER_KEY, type LifecycleState, type SlackConnector, type SlackEventEnvelope } from "@smc/connector-sdk";
import { getPrismaClient, newId } from "@smc/database";
import { createEvent, EventType } from "@smc/event-model";
import type { InboundMessagePayload } from "@smc/shared";
import { AuditLogService } from "../audit/audit-log.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";
import { findActiveLinkedAccount } from "../common/linked-account";
import { slackConfig } from "../config/slack.config";
import { CredentialsStoreService } from "../credentials-store/credentials-store.service";
import { EventsService } from "../events/events.service";
import { SlackApiService } from "./slack-api.service";
import { SlackOAuthStateService } from "./slack-oauth-state.service";

/** A signature/timestamp older than this is rejected as a possible replay - Slack's own documented guidance (api.slack.com/authentication/verifying-requests-from-slack). */
const MAX_REQUEST_AGE_SECONDS = 5 * 60;

/**
 * Slack's platform surface (docs/ROADMAP.md Phase 7). Combines Discord's
 * `oauth2_redirect` shape (connect returns an authorization URL, callback
 * completes the install) with Telegram's webhook shape (Slack's Events
 * API pushes here) - unlike Telegram's per-LinkedAccount webhook URL,
 * Slack's Events API webhook is registered once, app-wide, in the Slack
 * App config; incoming events carry their own `team_id` used to route to
 * the right LinkedAccount.
 */
@Controller("connectors/slack")
export class SlackController {
  private readonly logger = new Logger(SlackController.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly credentialsStore: CredentialsStoreService,
    private readonly auditLogService: AuditLogService,
    private readonly slackApi: SlackApiService,
    private readonly oauthState: SlackOAuthStateService,
  ) {}

  private get connector(): SlackConnector {
    return defaultConnectorRegistry.get(SLACK_PROVIDER_KEY) as SlackConnector;
  }

  @Post("connect")
  @UseGuards(JwtAuthGuard)
  async connect(@CurrentUser() claims: JwtPayload) {
    const clientId = slackConfig.clientId();
    const publicBaseUrl = slackConfig.publicBaseUrl();
    if (!clientId || !publicBaseUrl) {
      throw httpError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "SLACK_NOT_CONFIGURED",
        "Slack is not configured on this server (SLACK_CLIENT_ID / SLACK_PUBLIC_BASE_URL missing).",
      );
    }

    const state = await this.oauthState.create(claims.workspaceId);
    const redirectUri = `${publicBaseUrl.replace(/\/$/, "")}/v1/connectors/slack/callback`;

    const authorizationUrl = new URL("https://slack.com/oauth/v2/authorize");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("scope", slackConfig.botScopes());
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("state", state);

    return { authorizationUrl: authorizationUrl.toString() };
  }

  /** Slack redirects the user's browser here after they approve the install - never a JSON API call, always a real 302. */
  @Get("callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Res() res: Response,
  ) {
    const webAppUrl = slackConfig.webAppBaseUrl();

    if (oauthError || !code || !state) {
      res.redirect(`${webAppUrl}/?slack=error`);
      return;
    }

    const workspaceId = await this.oauthState.consume(state);
    if (!workspaceId) {
      res.redirect(`${webAppUrl}/?slack=error&reason=expired_state`);
      return;
    }

    const publicBaseUrl = slackConfig.publicBaseUrl();
    const redirectUri = `${(publicBaseUrl ?? "").replace(/\/$/, "")}/v1/connectors/slack/callback`;

    let exchange;
    try {
      exchange = await this.slackApi.oauthV2Access(slackConfig.clientId(), slackConfig.clientSecret(), code, redirectUri);
    } catch (err) {
      this.logger.warn(`Slack OAuth code exchange failed: ${(err as Error).message}`);
      res.redirect(`${webAppUrl}/?slack=error&reason=exchange_failed`);
      return;
    }

    const botToken = exchange.access_token;
    const teamId = exchange.team?.id;
    if (!botToken || !teamId) {
      res.redirect(`${webAppUrl}/?slack=error&reason=incomplete_exchange`);
      return;
    }

    // Section 3.2: a credential is never accepted and stored on faith, even
    // one Slack itself just issued - one real, minimal call confirms it.
    const validation = await this.connector.validateCredential({ botToken, teamId });
    if (!validation.valid) {
      this.logger.warn(`Slack connect validation failed for team ${teamId}: ${validation.reason}`);
      res.redirect(`${webAppUrl}/?slack=error&reason=validation_failed`);
      return;
    }

    const prisma = getPrismaClient();
    const provider = await prisma.provider.upsert({
      where: { key: SLACK_PROVIDER_KEY },
      update: {},
      create: { id: newId(), key: SLACK_PROVIDER_KEY, displayName: "Slack" },
    });

    const existing = await findActiveLinkedAccount(prisma, { workspaceId, providerId: provider.id, externalAccountId: teamId });
    if (existing) {
      res.redirect(`${webAppUrl}/?slack=already_connected`);
      return;
    }

    const { ref: credentialsRef } = await this.credentialsStore.putSecret(botToken);

    const linkedAccount = await prisma.linkedAccount.create({
      data: {
        id: newId(),
        workspaceId,
        providerId: provider.id,
        externalAccountId: teamId,
        status: "registered",
        credentialsRef,
      },
    });

    const lifecycle = this.connector.createLifecycle();
    lifecycle.transition("authenticating");
    lifecycle.transition("syncing_initial");
    // A real bounded backfill (Slack's conversations.history endpoint) -
    // the same proof-of-generalization Discord already established.
    await this.connector.initialSync(undefined, { credential: { botToken, teamId }, linkedAccountId: linkedAccount.id });
    lifecycle.transition("active");

    await prisma.linkedAccount.update({
      where: { id: linkedAccount.id },
      data: { status: lifecycle.current, lastSyncedAt: new Date() },
    });

    await this.auditLogService.log({
      workspaceId,
      actorType: "user",
      action: "connector.slack.connected",
      resourceType: "linked_account",
      resourceId: linkedAccount.id,
      metadata: { teamId },
    });

    res.redirect(`${webAppUrl}/?slack=connected`);
  }

  /**
   * Slack's Events API webhook - a single, app-wide endpoint (unlike
   * Telegram's per-LinkedAccount URL), authenticated via an HMAC-SHA256
   * signature over the raw request body (docs/SECURITY.md's authenticity
   * requirement), not a per-account secret. Must also answer the
   * one-time `url_verification` handshake Slack sends when the Events
   * API subscription is first configured.
   */
  @Post("events")
  async events(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    const timestamp = req.headers["x-slack-request-timestamp"];
    const signature = req.headers["x-slack-signature"];
    if (!this.isValidSignature(req.rawBody, typeof timestamp === "string" ? timestamp : undefined, typeof signature === "string" ? signature : undefined)) {
      throw httpError(HttpStatus.UNAUTHORIZED, "INVALID_SLACK_SIGNATURE", "Slack request signature verification failed.");
    }

    const envelope = req.body as SlackEventEnvelope;

    if (envelope.type === "url_verification") {
      res.status(HttpStatus.OK).json({ challenge: envelope.challenge });
      return;
    }

    const event = envelope.event;
    // Never ingest our own sends, other bots' messages, or channel
    // housekeeping notices (join/leave/topic-change - isSlackContentMessage
    // excludes those but keeps real content like file_share attachments)
    // - the same way Discord filters `author.bot` and Telegram filters to
    // message/edited_message updates only.
    if (!event || event.type !== "message" || event.bot_id || !isSlackContentMessage(event)) {
      res.status(HttpStatus.OK).json({ ok: true });
      return;
    }

    const prisma = getPrismaClient();
    const linkedAccount = await prisma.linkedAccount.findFirst({
      where: { externalAccountId: envelope.team_id, provider: { key: SLACK_PROVIDER_KEY } },
    });

    // A 200, not a 404: an unknown or already-disconnected workspace must
    // not make Slack treat this endpoint as failing and retry forever -
    // the same reasoning TelegramController's webhook handler documents.
    if (!linkedAccount || linkedAccount.deletedAt) {
      res.status(HttpStatus.OK).json({ ok: true });
      return;
    }

    const normalized = this.connector.mapMessage(event);
    const payload: InboundMessagePayload = {
      workspaceId: linkedAccount.workspaceId,
      providerKey: SLACK_PROVIDER_KEY,
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

    const messageEvent = createEvent({
      type: EventType.MESSAGE_RECEIVED,
      producer: `connector-worker:${SLACK_PROVIDER_KEY}`,
      workspaceId: linkedAccount.workspaceId,
      payload,
    });
    await this.eventsService.publish(messageEvent);

    res.status(HttpStatus.OK).json({ ok: true });
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

    // SECURITY.md Section 5.2: unconditional deletion is the guarantee;
    // Slack-side app uninstall (auth.revoke) is not called here - a
    // disclosed simplification (docs/reviews/phase-7-review.md), same
    // "best-effort, not required" framing CONNECTOR_SDK.md Section 3.2
    // stage 6 already gives provider-side revocation in general.
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
      action: "connector.slack.disconnected",
      resourceType: "linked_account",
      resourceId: linkedAccount.id,
    });

    return { id: linkedAccount.id, status: lifecycle.current };
  }

  private isValidSignature(rawBody: Buffer | undefined, timestamp: string | undefined, signature: string | undefined): boolean {
    const signingSecret = slackConfig.signingSecret();
    if (!signingSecret || !rawBody || !timestamp || !signature) return false;

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > MAX_REQUEST_AGE_SECONDS) return false;

    const base = `v0:${timestamp}:${rawBody.toString("utf8")}`;
    const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

    const expectedBuffer = Buffer.from(expected, "utf8");
    const actualBuffer = Buffer.from(signature, "utf8");
    if (expectedBuffer.length !== actualBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, actualBuffer);
  }
}
