import { getPrismaClient } from "@smc/database";

/**
 * Fuzzy candidate matching (docs/ARCHITECTURE.md Section 13.6, ADR-0013) -
 * every candidate match short of an exact `(provider, externalId)` repeat
 * (handled deterministically by `resolveIdentity()`, never here) becomes a
 * persisted, reviewable `IdentityMergeSuggestion`, regardless of confidence
 * score. This function never merges anything itself - matching and merging
 * are deliberately separate steps, the same "connectors supply signal, they
 * never make the merge decision" boundary `CONNECTOR_SDK.md` Section 13
 * already draws for connectors, applied here to the matching routine itself.
 *
 * The matching signal is deliberately simple and fully explainable
 * (normalized display-name comparison) - not an ML/NLP similarity model,
 * consistent with `PRODUCT.md`'s "the rule-based score must remain fully
 * usable on its own" principle applied to identity matching rather than
 * priority scoring. A real product would likely add shared-conversation-
 * participant and cross-provider-handle-similarity signals over time; this
 * is deliberately the smallest version that produces genuine, explainable
 * suggestions, not a placeholder.
 */
export interface MatchingSignals {
  reason: string;
  normalizedNameA: string;
  normalizedNameB: string;
}

export interface MergeCandidate {
  contactIdA: string;
  contactIdB: string;
  confidenceScore: number;
  matchingSignals: MatchingSignals;
}

function normalizeDisplayName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True if `shorter` looks like a real substring/prefix of `longer`, not just an accidental short match (e.g. "al" inside "small"). Guards against noisy suggestions on very short names. */
function isMeaningfulSubstring(shorter: string, longer: string): boolean {
  return shorter.length >= 3 && longer.includes(shorter);
}

/**
 * Scans every non-deleted Contact in a workspace for candidate duplicate
 * pairs. O(n^2) in the number of Contacts - a real, disclosed scale limit
 * (docs/reviews/phase-9-review.md), acceptable at this product's current
 * stage per the same "don't build for a scale not yet reached" principle
 * every prior phase has applied.
 */
export async function findMergeCandidates(workspaceId: string): Promise<MergeCandidate[]> {
  const prisma = getPrismaClient();
  const contacts = await prisma.contact.findMany({ where: { workspaceId } });

  const candidates: MergeCandidate[] = [];
  for (let i = 0; i < contacts.length; i += 1) {
    for (let j = i + 1; j < contacts.length; j += 1) {
      const a = contacts[i];
      const b = contacts[j];
      if (!a || !b) continue;
      const normA = normalizeDisplayName(a.displayName);
      const normB = normalizeDisplayName(b.displayName);

      if (normA === normB) {
        candidates.push({
          contactIdA: a.id,
          contactIdB: b.id,
          confidenceScore: 0.9,
          matchingSignals: { reason: "Identical display name", normalizedNameA: normA, normalizedNameB: normB },
        });
        continue;
      }

      const [shorter, longer] = normA.length <= normB.length ? [normA, normB] : [normB, normA];
      if (isMeaningfulSubstring(shorter, longer)) {
        candidates.push({
          contactIdA: a.id,
          contactIdB: b.id,
          confidenceScore: 0.6,
          matchingSignals: { reason: "Similar display name", normalizedNameA: normA, normalizedNameB: normB },
        });
      }
    }
  }
  return candidates;
}
