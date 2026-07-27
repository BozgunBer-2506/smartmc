import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { getPrismaClient, newId } from "@smc/database";
import { findMergeCandidates } from "@smc/identity";

const SUGGESTION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days - unreviewed suggestions expire (ARCHITECTURE.md Section 13.6)
const MATCHING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * The periodic routine that turns `findMergeCandidates()`'s output into
 * persisted `IdentityMergeSuggestion` rows (docs/ROADMAP.md Phase 9,
 * ADR-0013). Never merges anything itself - every suggestion this creates
 * sits `pending` until a human approves or rejects it via
 * `IdentityController`.
 *
 * Dedup against an already-`pending` or already-`rejected` suggestion for
 * the same pair is enforced here at the application level, not via a
 * partial unique DB index (`DATABASE.md` Section 6.6 specifies one scoped
 * to `status = 'pending'`) - this project has no migrations mechanism
 * beyond `prisma db push`, which cannot express a partial index without a
 * raw SQL migration step this phase doesn't introduce. A disclosed,
 * real simplification (docs/reviews/phase-9-review.md), not a silent gap:
 * a race between two concurrent runs could in principle create a
 * duplicate pending suggestion, acceptable at this product's current scale
 * and interval (10 minutes, effectively single-flight in practice).
 */
@Injectable()
export class IdentityMatchingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdentityMatchingService.name);
  private timer?: NodeJS.Timeout;

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => this.logger.error(`Identity matching sweep failed: ${(err as Error).message}`));
    }, MATCHING_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<void> {
    const prisma = getPrismaClient();
    const workspaces = await prisma.workspace.findMany({ select: { id: true } });

    for (const workspace of workspaces) {
      const candidates = await findMergeCandidates(workspace.id);
      let created = 0;

      for (const candidate of candidates) {
        const sorted = [candidate.contactIdA, candidate.contactIdB].sort();
        const contactIdA = sorted[0] as string;
        const contactIdB = sorted[1] as string;

        const alreadyDecidedOrPending = await prisma.identityMergeSuggestion.findFirst({
          where: {
            workspaceId: workspace.id,
            status: { in: ["pending", "rejected"] },
            OR: [
              { candidateContactIdA: contactIdA, candidateContactIdB: contactIdB },
              { candidateContactIdA: contactIdB, candidateContactIdB: contactIdA },
            ],
          },
        });
        if (alreadyDecidedOrPending) continue;

        await prisma.identityMergeSuggestion.create({
          data: {
            id: newId(),
            workspaceId: workspace.id,
            candidateContactIdA: contactIdA,
            candidateContactIdB: contactIdB,
            confidenceScore: candidate.confidenceScore,
            matchingSignals: candidate.matchingSignals,
            status: "pending",
            expiresAt: new Date(Date.now() + SUGGESTION_TTL_MS),
          },
        });
        created += 1;
      }

      if (created > 0) {
        this.logger.log(`Created ${created} new identity merge suggestion(s) for workspace ${workspace.id}`);
      }
    }

    // Anti-fatigue expiry sweep (ARCHITECTURE.md Section 13.6) - a pending
    // suggestion left unreviewed expires rather than accumulating forever.
    await prisma.identityMergeSuggestion.updateMany({
      where: { status: "pending", expiresAt: { lt: new Date() } },
      data: { status: "expired" },
    });
  }
}
