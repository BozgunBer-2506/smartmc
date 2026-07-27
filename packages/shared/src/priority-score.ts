/**
 * Unified priority scoring (docs/PRODUCT.md "every message gets a single
 * cross-app importance signal... that drives notification style, not the
 * source app's default") - rule-based and fully explainable, deliberately
 * not AI-derived (AI-assisted refinement is Phase 13, optional, additive
 * on top of this base signal per PRODUCT.md's "the rule-based score alone
 * must remain a fully usable signal on its own").
 */
export interface PriorityScoreInput {
  isVip: boolean;
  bodyText: string;
}

const URGENCY_KEYWORDS = ["urgent", "asap", "important", "emergency", "immediately"];

const BASE_SCORE = 10;
const VIP_BONUS = 50;
const URGENCY_BONUS = 20;

/** Sender-flagged urgency language boosts the score automatically (docs/PRODUCT.md item 9). */
function containsUrgencyKeyword(bodyText: string): boolean {
  const lower = bodyText.toLowerCase();
  return URGENCY_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function computePriorityScore(input: PriorityScoreInput): number {
  let score = BASE_SCORE;
  if (input.isVip) score += VIP_BONUS;
  if (containsUrgencyKeyword(input.bodyText)) score += URGENCY_BONUS;
  return score;
}
