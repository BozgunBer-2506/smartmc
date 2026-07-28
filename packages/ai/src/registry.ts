import type { AIProvider } from "./types";
import { HeuristicAIProvider } from "./heuristic-provider";

/**
 * Mirrors `packages/connector-sdk/src/registry.ts`'s pattern (ADR-0021
 * Decision 2) - a real LLM-backed provider registers here later without
 * any caller in apps/api changing; they resolve a provider by name, never
 * import a vendor SDK directly.
 */
export class AIProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): AIProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`No AI provider registered for "${name}".`);
    return provider;
  }
}

export const defaultAIProviderRegistry = new AIProviderRegistry();
defaultAIProviderRegistry.register(new HeuristicAIProvider());

/** The provider every workspace uses today - Phase 13 has exactly one. Naming this constant (rather than hardcoding "heuristic" at call sites) is what makes a future default-provider change a one-line edit. */
export const DEFAULT_AI_PROVIDER_NAME = "heuristic";
