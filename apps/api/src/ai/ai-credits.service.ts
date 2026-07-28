import { Injectable } from "@nestjs/common";
import { getPrismaClient, newId } from "@smc/database";

/**
 * DATABASE.md Section 6.15's append-only credit ledger, organization-
 * scoped (billing is per-Organization, not per-Workspace, matching
 * `billing_plans`/`Organization.planTier`). A single mutable counter is
 * deliberately not used - see ADR-0021 and DATABASE.md Section 6.15's own
 * "why an append-only ledger" reasoning: balances must be reconstructable
 * and auditable, not just correct-looking.
 */
@Injectable()
export class AiCreditsService {
  async getBalance(organizationId: string): Promise<number> {
    const prisma = getPrismaClient();
    const latest = await prisma.aiCreditLedger.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return latest?.balanceAfter ?? 0;
  }

  async grant(organizationId: string, amount: number, feature?: string): Promise<number> {
    const prisma = getPrismaClient();
    const balance = await this.getBalance(organizationId);
    const balanceAfter = balance + amount;
    await prisma.aiCreditLedger.create({
      data: { id: newId(), organizationId, entryType: "grant", amount, balanceAfter, feature: feature ?? null },
    });
    return balanceAfter;
  }

  /** Throws if the balance would go negative - callers translate that into a 402, never silently overdraw. */
  async consume(organizationId: string, amount: number, feature: string, relatedMessageId?: string): Promise<number> {
    const prisma = getPrismaClient();
    const balance = await this.getBalance(organizationId);
    if (balance < amount) {
      throw new Error("INSUFFICIENT_AI_CREDITS");
    }
    const balanceAfter = balance - amount;
    await prisma.aiCreditLedger.create({
      data: {
        id: newId(),
        organizationId,
        entryType: "consumption",
        amount: -amount,
        balanceAfter,
        feature,
        relatedMessageId: relatedMessageId ?? null,
      },
    });
    return balanceAfter;
  }

  async listLedger(organizationId: string, take = 50) {
    const prisma = getPrismaClient();
    return prisma.aiCreditLedger.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }
}
