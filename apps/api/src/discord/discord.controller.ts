import { Controller, Get, HttpStatus, Logger, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { defaultConnectorRegistry, DISCORD_PROVIDER_KEY, type DiscordConnector, type LifecycleState } from "@smc/connector-sdk";
import { getPrismaClient, newId } from "@smc/database";
import { AuditLogService } from "../audit/audit-log.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";
import { discordConfig } from "../config/discord.config";
import { CredentialsStoreService } from "../credentials-store/credentials-store.service";
import { DiscordGatewayManagerService } from "./discord-gateway-manager.service";
import { DiscordOAuthStateService } from "./discord-oauth-state.service";

/**
 * Discord's platform surface (docs/ROADMAP.md Phase 6). Unlike Telegram's
 * connect flow (a user pastes a bot token they created themselves),
 * Discord uses the `oauth2_redirect` method `CONNECTOR_SDK.md` Section 3.1
 * already names for it: `connect` returns an authorization URL the
 * frontend redirects the browser to, Discord redirects back to `callback`
 * with a `guild_id` once the user picks a server, and *that* is when a
 * LinkedAccount is actually created.
 */
@Controller("connectors/discord")
export class DiscordController {
  private readonly logger = new Logger(DiscordController.name);

  constructor(
    private readonly oauthState: DiscordOAuthStateService,
    private readonly credentialsStore: CredentialsStoreService,
    private readonly auditLogService: AuditLogService,
    private readonly gatewayManager: DiscordGatewayManagerService,
  ) {}

  private get connector(): DiscordConnector {
    return defaultConnectorRegistry.get(DISCORD_PROVIDER_KEY) as DiscordConnector;
  }

  @Post("connect")
  @UseGuards(JwtAuthGuard)
  async connect(@CurrentUser() claims: JwtPayload) {
    const clientId = discordConfig.clientId();
    const publicBaseUrl = discordConfig.publicBaseUrl();
    if (!clientId || !publicBaseUrl) {
      throw httpError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "DISCORD_NOT_CONFIGURED",
        "Discord is not configured on this server (DISCORD_CLIENT_ID / DISCORD_PUBLIC_BASE_URL missing).",
      );
    }

    const state = await this.oauthState.create(claims.workspaceId);
    const redirectUri = `${publicBaseUrl.replace(/\/$/, "")}/v1/connectors/discord/callback`;

    const authorizationUrl = new URL("https://discord.com/api/oauth2/authorize");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("scope", "bot");
    authorizationUrl.searchParams.set("permissions", discordConfig.botPermissions());
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("state", state);

    return { authorizationUrl: authorizationUrl.toString() };
  }

  /** Discord redirects the user's browser here after they pick a server - never a JSON API call, always a real 302. */
  @Get("callback")
  async callback(
    @Query("guild_id") guildId: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Res() res: Response,
  ) {
    const webAppUrl = discordConfig.webAppBaseUrl();

    if (oauthError || !guildId || !state) {
      res.redirect(`${webAppUrl}/?discord=error`);
      return;
    }

    const workspaceId = await this.oauthState.consume(state);
    if (!workspaceId) {
      res.redirect(`${webAppUrl}/?discord=error&reason=expired_state`);
      return;
    }

    const botToken = discordConfig.botToken();
    const validation = await this.connector.validateCredential({ botToken, guildId });
    if (!validation.valid) {
      this.logger.warn(`Discord connect validation failed for guild ${guildId}: ${validation.reason}`);
      res.redirect(`${webAppUrl}/?discord=error&reason=validation_failed`);
      return;
    }

    const prisma = getPrismaClient();
    const provider = await prisma.provider.upsert({
      where: { key: DISCORD_PROVIDER_KEY },
      update: {},
      create: { id: newId(), key: DISCORD_PROVIDER_KEY, displayName: "Discord" },
    });

    const existing = await prisma.linkedAccount.findFirst({
      where: { workspaceId, providerId: provider.id, externalAccountId: guildId },
    });
    if (existing) {
      res.redirect(`${webAppUrl}/?discord=already_connected`);
      return;
    }

    const { ref: credentialsRef } = await this.credentialsStore.putSecret(botToken);

    const linkedAccount = await prisma.linkedAccount.create({
      data: {
        id: newId(),
        workspaceId,
        providerId: provider.id,
        externalAccountId: guildId,
        status: "registered",
        credentialsRef,
      },
    });

    const lifecycle = this.connector.createLifecycle();
    lifecycle.transition("authenticating");
    lifecycle.transition("syncing_initial");
    // A real bounded backfill (ADR-0019) - unlike Telegram's no-op,
    // Discord's history endpoint makes this a genuine Section 8.1 sync.
    await this.connector.initialSync(undefined, { credential: { botToken, guildId }, linkedAccountId: linkedAccount.id });
    lifecycle.transition("active");

    await prisma.linkedAccount.update({
      where: { id: linkedAccount.id },
      data: { status: lifecycle.current, lastSyncedAt: new Date() },
    });

    await this.gatewayManager.start({ ...linkedAccount, status: lifecycle.current });

    await this.auditLogService.log({
      workspaceId,
      actorType: "user",
      action: "connector.discord.connected",
      resourceType: "linked_account",
      resourceId: linkedAccount.id,
      metadata: { guildId },
    });

    res.redirect(`${webAppUrl}/?discord=connected`);
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

    await this.gatewayManager.stop(linkedAccount.id);
    // SECURITY.md Section 5.2: unconditional deletion, regardless of connection state.
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
      action: "connector.discord.disconnected",
      resourceType: "linked_account",
      resourceId: linkedAccount.id,
    });

    return { id: linkedAccount.id, status: lifecycle.current };
  }
}
