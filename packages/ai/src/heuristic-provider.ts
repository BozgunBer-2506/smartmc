import type {
  AIProvider,
  ClassifyResult,
  DetectCommitmentsResult,
  DetectMeetingsResult,
  Entity,
  ExtractEntitiesResult,
  LanguageResult,
  MessageClassificationLabel,
  RewriteInput,
  RewriteResult,
  SentimentResult,
  SummarizeInput,
  SummarizeResult,
  SuggestRepliesResult,
  SuggestRuleInput,
  SuggestRuleResult,
  TextInput,
} from "./types";

const MODEL_NAME = "heuristic-v1";

const CLASSIFICATION_KEYWORDS: Record<Exclude<MessageClassificationLabel, "general">, string[]> = {
  invoice: ["invoice", "payment", "bill", "receipt", "due amount"],
  support: ["issue", "problem", "not working", "broken", "help", "error", "bug"],
  sales: ["pricing", "quote", "demo", "proposal", "purchase", "discount"],
  scheduling: ["meeting", "schedule", "call at", "available", "calendar"],
  personal: ["hey", "hi ", "how are you", "just checking in"],
};

const POSITIVE_WORDS = ["thanks", "thank you", "great", "awesome", "love", "appreciate", "perfect", "happy", "glad"];
const NEGATIVE_WORDS = ["urgent", "asap", "angry", "frustrated", "disappointed", "terrible", "broken", "issue", "problem", "not working", "unacceptable"];

const ENGLISH_STOPWORDS = ["the", "and", "is", "you", "for", "with", "this", "that", "have", "please"];

/**
 * The one real, working AI capability provider Phase 13 ships (ADR-0021) -
 * deterministic, no external network call, no API key required. Every
 * method here is honestly a simple heuristic, not LLM-grade output - each
 * is disclosed as such in docs/reviews/phase-13-review.md. The point is
 * that every AI feature genuinely works end-to-end in this environment
 * today, with zero vendor dependency, the same real-not-stub precedent
 * `MockConnector` set for connectors.
 */
export class HeuristicAIProvider implements AIProvider {
  readonly name = "heuristic";

  async summarize(input: SummarizeInput): Promise<SummarizeResult> {
    const sentences = splitSentences(input.text);
    let summary: string;
    if (sentences.length <= 2) {
      summary = input.text.trim();
    } else {
      // Extractive: first sentence (usually states the topic) + last sentence (often the ask/conclusion).
      summary = `${sentences[0]} ${sentences[sentences.length - 1]}`.trim();
    }
    if (summary.length > 240) summary = `${summary.slice(0, 237)}...`;
    return { summary, modelUsed: MODEL_NAME };
  }

  async suggestReplies(input: TextInput): Promise<SuggestRepliesResult> {
    const text = input.text.toLowerCase();
    const replies: string[] = [];

    if (text.includes("?")) {
      replies.push("Good question - let me get back to you shortly.");
    }
    if (/(meeting|schedule|call at|available)/.test(text)) {
      replies.push("Sounds good, that time works for me.");
    }
    if (/(thanks|thank you)/.test(text)) {
      replies.push("You're welcome!");
    }
    if (replies.length === 0) {
      replies.push("Thanks for the message - I'll take a look and follow up.");
    }
    replies.push("Got it, thanks for letting me know.");

    return { replies: replies.slice(0, 3), modelUsed: MODEL_NAME };
  }

  async detectCommitments(input: TextInput): Promise<DetectCommitmentsResult> {
    const commitments = [];
    // "I'll <do something> by/before <date-ish phrase>"
    const pattern = /\bi(?:'ll| will)\s+([^.!?]{3,80}?)(?:\s+(by|before)\s+([^.!?]{2,30}))?[.!?]/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(input.text)) !== null) {
      commitments.push({ text: match[0].trim(), dueDateHint: match[3]?.trim() ?? null });
    }
    return { commitments, modelUsed: MODEL_NAME };
  }

  async detectMeetings(input: TextInput): Promise<DetectMeetingsResult> {
    const meetings = [];
    const pattern = /\b(let'?s meet|meeting|call)\s+(?:at|on)?\s*([^.!?]{2,40})[.!?]?/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(input.text)) !== null) {
      meetings.push({ text: match[0].trim(), whenHint: match[2]?.trim() ?? null });
    }
    return { meetings, modelUsed: MODEL_NAME };
  }

  async classify(input: TextInput): Promise<ClassifyResult> {
    const text = input.text.toLowerCase();
    let bestLabel: MessageClassificationLabel = "general";
    let bestScore = 0;

    for (const [label, keywords] of Object.entries(CLASSIFICATION_KEYWORDS) as [Exclude<MessageClassificationLabel, "general">, string[]][]) {
      const score = keywords.filter((k) => text.includes(k)).length;
      if (score > bestScore) {
        bestScore = score;
        bestLabel = label;
      }
    }

    const confidence = bestScore === 0 ? 0.3 : Math.min(0.5 + bestScore * 0.15, 0.95);
    return { label: bestLabel, confidence, modelUsed: MODEL_NAME };
  }

  async detectSentiment(input: TextInput): Promise<SentimentResult> {
    const text = input.text.toLowerCase();
    const positiveHits = POSITIVE_WORDS.filter((w) => text.includes(w)).length;
    const negativeHits = NEGATIVE_WORDS.filter((w) => text.includes(w)).length;
    const raw = positiveHits - negativeHits;
    const score = Math.max(-1, Math.min(1, raw / 3));
    const sentiment = score > 0.15 ? "positive" : score < -0.15 ? "negative" : "neutral";
    return { sentiment, score, modelUsed: MODEL_NAME };
  }

  async detectLanguage(input: TextInput): Promise<LanguageResult> {
    // Deliberately minimal: presence of common English stopwords vs. not.
    // Real language detection needs a library/model - not attempted here,
    // disclosed in docs/reviews/phase-13-review.md rather than faked.
    const words = input.text.toLowerCase().split(/\s+/);
    const stopwordHits = words.filter((w) => ENGLISH_STOPWORDS.includes(w)).length;
    return { languageCode: stopwordHits >= 2 ? "en" : "unknown", modelUsed: MODEL_NAME };
  }

  async extractEntities(input: TextInput): Promise<ExtractEntitiesResult> {
    const entities: Entity[] = [];
    const patterns: [Entity["type"], RegExp][] = [
      ["email", /[\w.+-]+@[\w-]+\.[\w.-]+/g],
      ["url", /https?:\/\/[^\s]+/g],
      ["phone", /\+?\d[\d\s().-]{7,}\d/g],
      ["money", /\$\s?\d[\d,]*(?:\.\d{2})?/g],
      ["date", /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2})\b/gi],
    ];
    for (const [type, pattern] of patterns) {
      const matches = input.text.match(pattern) ?? [];
      for (const value of matches) entities.push({ type, value });
    }
    return { entities, modelUsed: MODEL_NAME };
  }

  async rewrite(input: RewriteInput): Promise<RewriteResult> {
    let text = input.text.trim();
    switch (input.style) {
      case "formal": {
        const contractions: [RegExp, string][] = [
          [/\bdon't\b/gi, "do not"],
          [/\bcan't\b/gi, "cannot"],
          [/\bwon't\b/gi, "will not"],
          [/\bi'm\b/gi, "I am"],
          [/\bit's\b/gi, "it is"],
          [/\bwe're\b/gi, "we are"],
        ];
        for (const [pattern, replacement] of contractions) text = text.replace(pattern, replacement);
        text = text.charAt(0).toUpperCase() + text.slice(1);
        if (!/[.!?]$/.test(text)) text += ".";
        break;
      }
      case "friendly": {
        if (!/^(hi|hey|hello)/i.test(text)) text = `Hi! ${text}`;
        if (!/(thanks|thank you)!?$/i.test(text)) text = `${text} Thanks!`;
        break;
      }
      case "concise": {
        const sentences = splitSentences(text);
        text = sentences[0] ?? text;
        if (text.length > 120) text = `${text.slice(0, 117)}...`;
        break;
      }
    }
    return { rewritten: text, modelUsed: MODEL_NAME };
  }

  async suggestRule(input: SuggestRuleInput): Promise<SuggestRuleResult> {
    const prompt = input.naturalLanguagePrompt.toLowerCase();

    // "notify me if a VIP messages"
    if (/\bvip\b/.test(prompt) && /(notify|remind|alert)/.test(prompt)) {
      return {
        matched: true,
        modelUsed: MODEL_NAME,
        draft: {
          name: "Notify me on VIP messages",
          trigger: { type: "message.received" },
          conditions: { field: "sender.isVip", operator: "is_true" },
          actions: [{ type: "notification.send", params: { title: "VIP message from {{sender.displayName}}", body: "{{message.bodyText}}" } }],
          isDraft: true,
        },
      };
    }

    // "remind me if <person/anyone> doesn't reply in <N> hours/days"
    const noReplyMatch = prompt.match(/(\d+)\s*(hour|day)/);
    if (noReplyMatch && /(reply|respond)/.test(prompt)) {
      const amount = Number(noReplyMatch[1]);
      const hours = noReplyMatch[2] === "day" ? amount * 24 : amount;
      return {
        matched: true,
        modelUsed: MODEL_NAME,
        draft: {
          name: `Remind me if no reply after ${noReplyMatch[0]}`,
          trigger: { type: "time.no_reply_after", params: { hours } },
          conditions: { op: "AND", children: [] },
          actions: [{ type: "notification.send", params: { title: "No reply reminder", body: "Still waiting on a reply." } }],
          isDraft: true,
        },
      };
    }

    // "tag/notify messages mentioning 'X'"
    const keywordMatch = prompt.match(/["']([^"']{2,40})["']/);
    const keyword = keywordMatch?.[1];
    if (keyword && /(tag|notify|alert)/.test(prompt)) {
      return {
        matched: true,
        modelUsed: MODEL_NAME,
        draft: {
          name: `Tag messages mentioning "${keyword}"`,
          trigger: { type: "message.received" },
          conditions: { field: "message.bodyText", operator: "contains", value: keyword },
          actions: [{ type: "tag.apply", params: { tag: keyword } }],
          isDraft: true,
        },
      };
    }

    return {
      matched: false,
      modelUsed: MODEL_NAME,
      note: "Could not confidently map this prompt to a rule template - try phrasing it like \"notify me if a VIP messages\", \"remind me if no reply in 2 days\", or mention a specific keyword in quotes.",
    };
  }
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
