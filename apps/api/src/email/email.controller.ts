import { Body, Controller, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { defaultConnectorRegistry, EMAIL_PROVIDER_KEY, type EmailConnector, type EmailCredential, type LifecycleState } from "@smc/connector-sdk";
import { getPrismaClient, newId } from "@smc/database";
import { AuditLogService } from "../audit/audit-log.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtPayload } from "../auth/jwt-payload";
import { httpError } from "../common/http-error";
import { findActiveLinkedAccount } from "../common/linked-account";
import { CredentialsStoreService } from "../credentials-store/credentials-store.service";

interface ConnectEmailDto {
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  username?: string;
  password?: string;
}

/**
 * Email's platform surface (docs/ROADMAP.md Phase 8) - the simplest of
 * the four connectors' controllers: `credential_entry` auth needs no
 * OAuth redirect/callback (unlike Discord/Slack) and `"polling"`
 * ingestion needs no webhook receiver (unlike Telegram/Slack) - just
 * connect and disconnect. `EmailPollingService` (not this controller)
 * is where the actual receive loop lives, the same separation
 * Telegram/Discord/Slack's *ReconciliationService classes already use,
 * except here polling is the primary path, not a backstop.
 */
@Controller("connectors/email")
export class EmailController {
  constructor(
    private readonly credentialsStore: CredentialsStoreService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private get connector(): EmailConnector {
    return defaultConnectorRegistry.get(EMAIL_PROVIDER_KEY) as EmailConnector;
  }

  @Post("connect")
  @UseGuards(JwtAuthGuard)
  async connect(@Body() dto: ConnectEmailDto, @CurrentUser() claims: JwtPayload) {
    if (
      !dto.imapHost ||
      typeof dto.imapPort !== "number" ||
      typeof dto.imapSecure !== "boolean" ||
      !dto.smtpHost ||
      typeof dto.smtpPort !== "number" ||
      typeof dto.smtpSecure !== "boolean" ||
      !dto.username ||
      !dto.password
    ) {
      throw httpError(
        HttpStatus.BAD_REQUEST,
        "EMAIL_CREDENTIAL_REQUIRED",
        "IMAP/SMTP host, port, secure flag, username, and password are all required.",
      );
    }
    const credential: EmailCredential = {
      imapHost: dto.imapHost,
      imapPort: dto.imapPort,
      imapSecure: dto.imapSecure,
      smtpHost: dto.smtpHost,
      smtpPort: dto.smtpPort,
      smtpSecure: dto.smtpSecure,
      username: dto.username,
      password: dto.password,
    };

    // Section 3.2: a real IMAP login + SMTP verify() before persistence,
    // never accepted on faith.
    const validation = await this.connector.validateCredential(credential);
    if (!validation.valid) {
      throw httpError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "INVALID_EMAIL_CREDENTIAL",
        validation.reason ?? "The mail server rejected these credentials.",
      );
    }

    const prisma = getPrismaClient();
    const provider = await prisma.provider.upsert({
      where: { key: EMAIL_PROVIDER_KEY },
      update: {},
      create: { id: newId(), key: EMAIL_PROVIDER_KEY, displayName: "Email" },
    });

    const existing = await findActiveLinkedAccount(prisma, {
      workspaceId: claims.workspaceId,
      providerId: provider.id,
      externalAccountId: credential.username,
    });
    if (existing) {
      throw httpError(
        HttpStatus.CONFLICT,
        "LINKED_ACCOUNT_ALREADY_EXISTS",
        "This mailbox is already connected to your workspace.",
      );
    }

    // Unlike Discord/Slack's shared-token-plus-externalAccountId split,
    // every field here (including host/port/username) goes through the
    // encrypted secret store together - none of it is sensitive enough
    // to skip encryption, but none of it is safe to reconstruct from a
    // bare LinkedAccount row either, so the whole credential is stored
    // as one JSON blob rather than split.
    const { ref: credentialsRef } = await this.credentialsStore.putSecret(JSON.stringify(credential));

    const linkedAccount = await prisma.linkedAccount.create({
      data: {
        id: newId(),
        workspaceId: claims.workspaceId,
        providerId: provider.id,
        externalAccountId: credential.username,
        status: "registered",
        credentialsRef,
      },
    });

    const lifecycle = this.connector.createLifecycle();
    lifecycle.transition("authenticating");
    lifecycle.transition("syncing_initial");
    await this.connector.initialSync(undefined, { credential, linkedAccountId: linkedAccount.id });
    lifecycle.transition("active");

    await prisma.linkedAccount.update({
      where: { id: linkedAccount.id },
      data: { status: lifecycle.current, lastSyncedAt: new Date() },
    });

    await this.auditLogService.log({
      workspaceId: claims.workspaceId,
      actorUserId: claims.sub,
      actorType: "user",
      action: "connector.email.connected",
      resourceType: "linked_account",
      resourceId: linkedAccount.id,
      metadata: { username: credential.username },
    });

    return {
      id: linkedAccount.id,
      status: lifecycle.current,
      providerKey: EMAIL_PROVIDER_KEY,
      externalAccountId: credential.username,
    };
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

    // SECURITY.md Section 5.2: unconditional deletion. Email has no
    // provider-side revocation endpoint to call even best-effort (an
    // IMAP/SMTP password isn't a token an app can revoke on its own -
    // only the mailbox owner can rotate it), unlike Discord/Slack/
    // Telegram's provider APIs.
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
      action: "connector.email.disconnected",
      resourceType: "linked_account",
      resourceId: linkedAccount.id,
    });

    return { id: linkedAccount.id, status: lifecycle.current };
  }
}
