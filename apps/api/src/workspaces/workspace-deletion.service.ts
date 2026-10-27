import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { DISCORD_PROVIDER_KEY, TELEGRAM_PROVIDER_KEY } from "@smc/connector-sdk";
import { getPrismaClient } from "@smc/database";
import { AuditLogService } from "../audit/audit-log.service";
import { httpError } from "../common/http-error";
import { sanitizeErrorMessage } from "../common/sanitize-error";
import { CredentialsStoreService } from "../credentials-store/credentials-store.service";
import { DiscordGatewayManagerService } from "../discord/discord-gateway-manager.service";
import { EventsService } from "../events/events.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { TelegramApiService } from "../telegram/telegram-api.service";

interface CleanupResult {
  linkedAccountId: string;
  provider: string;
  ok: boolean;
  detail?: string;
}

// How long this request waits for the BullMQ purge before moving on
// regardless (see the call site below) - well under ioredis's own
// worst-case retry exhaustion (tens of seconds with no custom
// retryStrategy configured), so a Redis outage can't stall this
// already-committed deletion's HTTP response.
const WORKSPACE_PURGE_WAIT_MS = 2000;

/**
 * Owner-authorized, permanent workspace deletion (Phase 2A). Account
 * (user) deletion, with its own multi-workspace/last-owner rules, is a
 * separate, not-yet-built phase - this service only ever acts on exactly
 * one workspace and never touches any other user's session.
 *
 * Two deliberately separate stages, never mixed:
 * 1. Best-effort external cleanup (Telegram webhook delete, Discord
 *    Gateway disconnect) - real network I/O, run OUTSIDE any DB
 *    transaction so a slow/hanging provider call can never hold a
 *    Postgres transaction open. Mirrors the exact calls each connector's
 *    own disconnect() already makes (telegram.controller.ts,
 *    discord.controller.ts) - not reimplemented, reused.
 * 2. One bounded Postgres transaction that permanently erases every row
 *    this workspace owns, in FK-dependency order (verified against the
 *    actual generated migration SQL, not assumed - RESTRICT for every
 *    required relation, SET NULL for the four optional ones, none of
 *    which affects this ordering).
 *
 * `withSoftDeletes()` (packages/database/src/soft-delete.ts) silently
 * redirects `.delete()`/`.deleteMany()` on Organization, Workspace,
 * Contact, Conversation, Message, WorkspaceMember, LinkedAccount and Rule
 * into a `deletedAt` UPDATE, never a real row removal - correct for every
 * other caller, but exactly backwards for a feature whose entire purpose
 * is real erasure. `tx.$executeRaw` is a raw SQL method, not a model
 * query, so the extension's `query.$allModels` interception never sees
 * it - this is the one deliberate, narrow, commented bypass of that
 * extension in the whole codebase, used only for these 8 tables.
 */
@Injectable()
export class WorkspaceDeletionService {
  private readonly logger = new Logger(WorkspaceDeletionService.name);

  constructor(
    private readonly credentialsStore: CredentialsStoreService,
    private readonly telegramApi: TelegramApiService,
    private readonly discordGateway: DiscordGatewayManagerService,
    private readonly auditLog: AuditLogService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly events: EventsService,
  ) {}

  async deleteWorkspace(
    workspaceId: string,
    actorUserId: string,
    options?: { requireNoOtherMembers?: boolean },
  ): Promise<void> {
    const prisma = getPrismaClient();

    // Authorization is verified against current Postgres state, not the
    // JWT's `role` claim - RolesGuard only proves the token *claims*
    // "owner" at issuance (apps/api/src/auth/roles.guard.ts reads
    // `request.user?.role` alone, no DB round-trip); only a fresh
    // membership row proves it's still true now, and that this workspace
    // (and this user's membership in it) still exists at all. A
    // concurrent second deletion request loses this lookup once the
    // first commits - the row is gone, so this throws the same
    // WORKSPACE_NOT_FOUND a stale/forged request would.
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: actorUserId },
    });
    if (!member) {
      throw httpError(HttpStatus.NOT_FOUND, "WORKSPACE_NOT_FOUND", "Workspace not found.");
    }
    if (member.role !== "owner") {
      throw httpError(HttpStatus.FORBIDDEN, "OWNER_ROLE_REQUIRED", "Only the workspace owner can delete it.");
    }

    const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId } });
    if (!workspace) {
      throw httpError(HttpStatus.NOT_FOUND, "WORKSPACE_NOT_FOUND", "Workspace not found.");
    }
    const organizationId = workspace.organizationId;

    const linkedAccounts = await prisma.linkedAccount.findMany({
      where: { workspaceId },
      include: { provider: true },
    });

    const cleanupResults = await this.cleanupConnectors(linkedAccounts, workspaceId, actorUserId);

    await prisma.$transaction(async (tx) => {
      // `SELECT ... FOR UPDATE` first, not just a plain re-check: two
      // concurrent deletions would otherwise both pass a plain
      // `findFirst` under Postgres's default READ COMMITTED isolation
      // (neither transaction's writes are visible to the other until
      // commit), so both would proceed to delete the same rows - the
      // second's raw DELETEs would simply affect zero rows and it would
      // return 204 too, a silent double-success instead of a real
      // conflict signal. The row lock forces the second transaction to
      // block until the first commits (or rolls back); once unblocked, it
      // re-reads and correctly finds the row already gone.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`;
      if (locked.length === 0) {
        throw httpError(HttpStatus.NOT_FOUND, "WORKSPACE_NOT_FOUND", "Workspace not found.");
      }
      const stillOwner = await tx.workspaceMember.findFirst({ where: { workspaceId, userId: actorUserId, role: "owner" } });
      if (!stillOwner) {
        throw httpError(HttpStatus.NOT_FOUND, "WORKSPACE_NOT_FOUND", "Workspace not found.");
      }

      // Phase 2B's account-deletion product rule ("sole owner + other
      // members -> reject, never silently take their access with you")
      // must be enforced HERE, inside the same lock, not as an earlier,
      // separate read in the caller (AccountDeletionService previously
      // did exactly that, and it was a real TOCTOU: a member could be
      // inserted in the gap between that read and this transaction).
      //
      // PostgreSQL locking verified, not assumed: WorkspaceMember.workspaceId
      // is a required (RESTRICT) foreign key to Workspace.id - inserting a
      // WorkspaceMember row makes Postgres acquire a FOR KEY SHARE lock on
      // the referenced `workspaces` row to enforce that constraint, and
      // FOR KEY SHARE conflicts with the FOR UPDATE this transaction is
      // already holding (line above). A concurrent INSERT therefore
      // blocks the moment it's attempted, for as long as this transaction
      // holds the lock - it cannot complete, be read by the check below,
      // or race past it. If this transaction commits, that blocked INSERT
      // then fails outright with a real FK violation (the workspace row
      // is gone) - it can never silently attach a member to a workspace
      // this transaction already erased. If this transaction instead
      // rolls back here (the throw below), the blocked INSERT proceeds
      // normally once the lock releases. Either way, no interleaving
      // exists where a concurrently-inserted member is missed.
      if (options?.requireNoOtherMembers) {
        const otherMember = await tx.workspaceMember.findFirst({ where: { workspaceId, userId: { not: actorUserId } } });
        if (otherMember) {
          throw httpError(
            HttpStatus.CONFLICT,
            "WORKSPACE_HAS_OTHER_MEMBERS",
            "This workspace has other members and cannot be deleted this way.",
          );
        }
      }

      // Dependency order below is the exact order required by the 28
      // real RESTRICT foreign keys confirmed in the generated migration
      // SQL (`grep "ON DELETE" packages/database/prisma/migrations/*/migration.sql`)
      // - not assumed from the schema's relation declarations alone.
      await tx.notification.deleteMany({ where: { workspaceId } });
      await tx.messageAiSummary.deleteMany({ where: { workspaceId } });
      // Message: soft-delete-intercepted model - raw DELETE for real erasure.
      await tx.$executeRaw`DELETE FROM messages WHERE workspace_id = ${workspaceId}::uuid`;
      // Rule's dependents (RESTRICT) must go before Rule itself, below.
      await tx.ruleExecutionLog.deleteMany({ where: { workspaceId } });
      await tx.scheduledJob.deleteMany({ where: { workspaceId } });
      await tx.scheduledMessage.deleteMany({ where: { workspaceId } });
      // Conversation: soft-delete-intercepted - raw DELETE. Must follow
      // Message (messages.conversation_id is a required RESTRICT FK).
      await tx.$executeRaw`DELETE FROM conversations WHERE workspace_id = ${workspaceId}::uuid`;
      // ContactIdentity's FK to Contact is required/RESTRICT - must go before Contact.
      await tx.contactIdentity.deleteMany({ where: { workspaceId } });
      await tx.identityMergeSuggestion.deleteMany({ where: { workspaceId } });
      await tx.identityMergeLog.deleteMany({ where: { workspaceId } });
      await tx.identitySplitLog.deleteMany({ where: { workspaceId } });
      // Contact: soft-delete-intercepted - raw DELETE.
      await tx.$executeRaw`DELETE FROM contacts WHERE workspace_id = ${workspaceId}::uuid`;
      // Rule: soft-delete-intercepted - raw DELETE. Its own RESTRICT
      // dependents (RuleExecutionLog, ScheduledJob) are already gone above.
      await tx.$executeRaw`DELETE FROM rules WHERE workspace_id = ${workspaceId}::uuid`;

      // SecretRecord is already excluded from the soft-delete extension
      // (credentials-store.service.ts's own deleteSecret() comment) - a
      // real DELETE either way. Done here, inside this same transaction,
      // rather than via CredentialsStoreService.deleteSecret() (which
      // always opens its own separate client call), so it stays part of
      // this one bounded, atomic unit instead of a second, un-atomic write.
      for (const linkedAccount of linkedAccounts) {
        await tx.secretRecord.delete({ where: { id: linkedAccount.credentialsRef } }).catch(() => undefined);
      }
      // LinkedAccount: soft-delete-intercepted - raw DELETE. Conversation
      // (already gone above) held the only FK pointing at it, and that
      // FK is SET NULL/optional, so order relative to it never mattered.
      await tx.$executeRaw`DELETE FROM linked_accounts WHERE workspace_id = ${workspaceId}::uuid`;

      await tx.notificationPreference.deleteMany({ where: { workspaceId } });
      await tx.pushSubscription.deleteMany({ where: { workspaceId } });
      // Phase 16.1: WorkspaceInvite.workspaceId is RESTRICT - must go
      // before Workspace itself, same as every other dependent table here.
      // Not soft-delete-intercepted, so a plain deleteMany is a real DELETE.
      await tx.workspaceInvite.deleteMany({ where: { workspaceId } });

      // Phase 16.1 security-audit fix: Session now carries workspaceId
      // (RESTRICT) - must go before Workspace, same as every other
      // dependent table here. Scoped to THIS workspace's sessions only,
      // never account-wide: a member may belong to other workspaces
      // whose sessions must keep working untouched (the original intent
      // this comment always documented, now actually enforceable since
      // a session is finally scoped to one workspace instead of being
      // account-wide by accident).
      await tx.session.deleteMany({ where: { workspaceId } });

      // WorkspaceMember: soft-delete-intercepted - raw DELETE. Must
      // precede Workspace (workspace_members.workspace_id is RESTRICT).
      await tx.$executeRaw`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId}::uuid`;
      // Workspace itself: soft-delete-intercepted - raw DELETE.
      await tx.$executeRaw`DELETE FROM workspaces WHERE id = ${workspaceId}::uuid`;

      // Organization is only deleted if no sibling workspace still
      // references it - this product's register() always creates a
      // brand-new 1:1 Organization+Workspace pair (auth.service.ts), but
      // the schema permits more than one Workspace per Organization, so
      // this is checked rather than assumed.
      const siblingWorkspace = await tx.workspace.findFirst({ where: { organizationId } });
      if (!siblingWorkspace) {
        await tx.aiCreditLedger.deleteMany({ where: { organizationId } });
        await tx.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}::uuid`;
      }
    });

    // The entire `workspace:<id>` room, not just the actor's own
    // connection - the workspace no longer exists for anyone at all
    // (requireNoOtherMembers guarantees there was nobody else, in the
    // account-deletion path; a direct DELETE /v1/workspace without that
    // option can still legitimately take other members down with it, per
    // this endpoint's existing, unchanged authority - see
    // workspaces.controller.ts). Not a DB operation, so deliberately
    // outside the transaction above, same reasoning as the external
    // connector cleanup earlier in this method.
    this.realtimeGateway.disconnectWorkspace(workspaceId);

    // Phase 3A (GDPR data-retention audit) - best-effort, same posture as
    // the disconnect above: Redis is external, the DB work already
    // committed, so a failure here must never surface as this request
    // failing. Removes only this exact workspaceId's own completed/
    // failed/waiting/delayed jobs (events.service.ts's own scoping, never a
    // queue-wide operation) - closes the "message content outlives a
    // deleted workspace in Redis" gap this audit found, without an
    // absolute guarantee for an already-active job or a Redis backup.
    //
    // Phase 3A final review finding: with no custom ioredis retryStrategy
    // configured (events/redis-connection.ts), a genuinely unreachable
    // Redis makes the `getJobs()` calls inside purgeWorkspaceJobs() retry
    // internally against ioredis's own defaults (retryStrategy caps at
    // 2000ms per attempt, maxRetriesPerRequest: 20) before that promise
    // ever settles - tens of seconds `await`ed here, even though the
    // Postgres deletion above already fully committed. Bounded with a
    // race against a short timeout so this method (and so the HTTP
    // response) is never held hostage by Redis's own reconnect schedule.
    //
    // This is a bounded WAIT, not a cancellation: `Promise.race` cannot
    // stop the underlying `purgeWorkspaceJobs()` call once started - it
    // keeps running against ioredis's retry schedule in the background
    // regardless of which side of the race settles first. The `.catch()`
    // below is attached unconditionally, before the race, specifically
    // so that eventual rejection (arriving after this method has already
    // returned) is still handled and never becomes an unhandled
    // rejection. If the timeout branch wins, Redis cleanup for this
    // workspace is NOT confirmed complete - only that this method
    // stopped waiting for it. The content may well still be purged
    // moments later when the background call finishes, or it may fail
    // outright; either way, nothing here re-checks or retries it, and
    // BullMQ's own age-based retention (events.service.ts) is a
    // best-effort eventual bound, not a deadline this code enforces or
    // can rely on if this specific purge attempt never completes.
    const purgeOutcome = this.events.purgeWorkspaceJobs(workspaceId).catch((err) => {
      this.logger.warn(`Failed to purge BullMQ jobs for deleted workspace ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    });
    const purgeTimedOut = await Promise.race([
      purgeOutcome.then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), WORKSPACE_PURGE_WAIT_MS)),
    ]);
    if (purgeTimedOut) {
      this.logger.warn(
        `BullMQ purge for deleted workspace ${workspaceId} did not finish within ${WORKSPACE_PURGE_WAIT_MS}ms (Redis may be slow or unreachable) - proceeding without waiting further. The purge is not confirmed complete; it may still finish or fail in the background.`,
      );
    }

    // Outside the transaction, same convention as AuthService.register's
    // own audit write - an audit-log failure must never roll back an
    // already-committed deletion. AuditLog.workspaceId has no FK
    // (schema.prisma's own comment: "keeps audit history independent of
    // whether its subject still exists"), so this is safe to write after
    // the workspace is gone. Never includes message content or secrets -
    // only counts and the per-connector cleanup outcome.
    await this.auditLog.log({
      organizationId,
      actorUserId,
      actorType: "user",
      action: "workspace.deleted",
      resourceType: "workspace",
      resourceId: workspaceId,
      metadata: {
        linkedAccountCount: linkedAccounts.length,
        connectorCleanup: cleanupResults,
      },
    });
  }

  /**
   * Best-effort, outside any DB transaction. Mirrors each connector's own
   * disconnect() exactly: Telegram calls deleteWebhook with the real bot
   * token (SECURITY.md Section 5.2's existing audited-retrieval path),
   * Discord stops its in-process Gateway handle, Slack and Email have no
   * provider-side call to make (same as their own disconnect() methods -
   * slack.controller.ts/email.controller.ts's own disclosed
   * simplifications, not something this phase changes). Each outcome is
   * caught and recorded (not silently dropped) - this is diagnostic only,
   * never a hard failure for the caller: SecretRecord deletion inside the
   * transaction above is unconditional regardless of this outcome, and
   * once it runs there is nothing left to retry with (the credential
   * needed to retry is gone by design) - retrying this step later would
   * be meaningless, so none is attempted.
   */
  private async cleanupConnectors(
    linkedAccounts: Array<{ id: string; credentialsRef: string; provider: { key: string } }>,
    workspaceId: string,
    actorUserId: string,
  ): Promise<CleanupResult[]> {
    const results: CleanupResult[] = [];

    for (const linkedAccount of linkedAccounts) {
      try {
        if (linkedAccount.provider.key === TELEGRAM_PROVIDER_KEY) {
          // Deliberately NOT individually `.catch()`-swallowed here
          // (unlike the inline calls in telegram.controller.ts's own
          // disconnect(), which has no outer handler to report to) - this
          // loop's own try/catch is the single place that classifies and
          // records the outcome, per item 8's explicit "handle failures
          // explicitly, with diagnostic logging" requirement.
          const botToken = await this.credentialsStore.getSecret(linkedAccount.credentialsRef, {
            workspaceId,
            actorType: "user",
            actorUserId,
            audit: true,
          });
          await this.telegramApi.deleteWebhook(botToken);
        } else if (linkedAccount.provider.key === DISCORD_PROVIDER_KEY) {
          await this.discordGateway.stop(linkedAccount.id);
        }
        // Slack/Email: nothing to do here - neither connector's own
        // disconnect() calls out to the provider either.
        results.push({ linkedAccountId: linkedAccount.id, provider: linkedAccount.provider.key, ok: true });
      } catch (err) {
        // Never reaches the caller as a hard failure - this is diagnostic
        // only, logged with the same redaction every connector error
        // already gets before it's ever persisted or returned.
        const detail = sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) ?? undefined;
        this.logger.warn(`Connector cleanup failed for ${linkedAccount.provider.key} (${linkedAccount.id}): ${detail}`);
        results.push({ linkedAccountId: linkedAccount.id, provider: linkedAccount.provider.key, ok: false, detail });
      }
    }

    return results;
  }
}
