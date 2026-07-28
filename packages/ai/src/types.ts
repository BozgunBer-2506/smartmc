import type { ActionStep, ConditionNode, RuleTrigger } from "@smc/automation-engine";

/**
 * The provider-agnostic AI boundary (docs/adr/0021-provider-agnostic-ai-abstraction.md).
 * Every capability takes structured input and returns a structured,
 * typed result - never a raw prompt string in, never free text the caller
 * has to parse out. This is what lets `HeuristicAIProvider` (Phase 13's
 * only implementation - deterministic, no external call, no API key) be
 * swapped for a real LLM-backed provider later without any caller in
 * apps/api changing: they depend on this interface, never a vendor SDK.
 */
export interface AIProvider {
  readonly name: string;

  summarize(input: SummarizeInput): Promise<SummarizeResult>;
  suggestReplies(input: TextInput): Promise<SuggestRepliesResult>;
  detectCommitments(input: TextInput): Promise<DetectCommitmentsResult>;
  detectMeetings(input: TextInput): Promise<DetectMeetingsResult>;
  classify(input: TextInput): Promise<ClassifyResult>;
  detectSentiment(input: TextInput): Promise<SentimentResult>;
  detectLanguage(input: TextInput): Promise<LanguageResult>;
  extractEntities(input: TextInput): Promise<ExtractEntitiesResult>;
  rewrite(input: RewriteInput): Promise<RewriteResult>;
  suggestRule(input: SuggestRuleInput): Promise<SuggestRuleResult>;
}

export interface TextInput {
  text: string;
}

export interface SummarizeInput extends TextInput {
  /** Longer inputs (a whole thread) vs. a single message get slightly different treatment - AUTOMATION_ENGINE.md/DATABASE.md both distinguish per-message vs per-conversation summaries. */
  kind: "message" | "conversation";
}

export interface SummarizeResult {
  summary: string;
  modelUsed: string;
}

export interface SuggestRepliesResult {
  replies: string[];
  modelUsed: string;
}

export interface CommitmentCandidate {
  text: string;
  dueDateHint: string | null;
}
export interface DetectCommitmentsResult {
  commitments: CommitmentCandidate[];
  modelUsed: string;
}

export interface MeetingCandidate {
  text: string;
  whenHint: string | null;
}
export interface DetectMeetingsResult {
  meetings: MeetingCandidate[];
  modelUsed: string;
}

export type MessageClassificationLabel = "invoice" | "support" | "sales" | "scheduling" | "personal" | "general";
export interface ClassifyResult {
  label: MessageClassificationLabel;
  confidence: number;
  modelUsed: string;
}

export type SentimentLabel = "positive" | "neutral" | "negative";
export interface SentimentResult {
  sentiment: SentimentLabel;
  score: number; // -1 (very negative) to 1 (very positive)
  modelUsed: string;
}

export interface LanguageResult {
  /** ISO 639-1-ish code, or "unknown" when the heuristic can't tell - never a confident guess presented as certain. */
  languageCode: string;
  modelUsed: string;
}

export interface Entity {
  type: "email" | "url" | "phone" | "money" | "date";
  value: string;
}
export interface ExtractEntitiesResult {
  entities: Entity[];
  modelUsed: string;
}

export type RewriteStyle = "formal" | "friendly" | "concise";
export interface RewriteInput extends TextInput {
  style: RewriteStyle;
}
export interface RewriteResult {
  rewritten: string;
  modelUsed: string;
}

export interface SuggestRuleInput {
  naturalLanguagePrompt: string;
}

/** A draft rule shape (AUTOMATION_ENGINE.md Section 8.3: `isDraft: true`, opened in the builder, never persisted until the user explicitly saves it). Uses the exact same trigger/condition/action types the real Automation Engine evaluates - never a parallel, looser representation. */
export interface DraftRule {
  name: string;
  trigger: RuleTrigger;
  conditions: ConditionNode;
  actions: ActionStep[];
  isDraft: true;
}

export interface SuggestRuleResult {
  matched: boolean;
  draft?: DraftRule;
  /** Set when `matched` is false - AUTOMATION_ENGINE.md Section 8.4's "failure is explicit," never a silently wrong rule. */
  note?: string;
  modelUsed: string;
}
