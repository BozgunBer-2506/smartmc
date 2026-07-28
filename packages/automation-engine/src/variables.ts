import type { ContextObject } from "./types";

/** Context variable interpolation (AUTOMATION_ENGINE.md Section 4.3's first tier only - `{{message.body}}`-style references resolved fresh from the Context Object at execution time). Workspace variables (Section 4.3 tier 2, `{{vars.x}}`) and computed/derived step-output variables (tier 3, `{{steps.x.output}}`) are deferred - Phase 10 has no workspace-variable store and actions never chain outputs (Section 5.2's branching/parallel/delayed-action graph is also deferred), so there is nothing yet for those two tiers to reference. An unresolved `{{...}}` is left verbatim rather than silently dropped, so a misspelled reference is visible in the rendered output instead of disappearing. */
export function interpolate(template: string, context: ContextObject): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, field: string) => {
    const [section, ...rest] = field.split(".");
    const path = rest.join(".");
    let root: unknown;
    switch (section) {
      case "message":
        root = context.message;
        break;
      case "conversation":
        root = context.conversation;
        break;
      case "sender":
        root = context.sender;
        break;
      case "workspace":
        root = context.workspace;
        break;
      case "ai":
        root = context.ai;
        break;
      default:
        return match;
    }
    if (root === undefined || root === null) return match;
    const value = path.split(".").reduce<unknown>((acc, key) => {
      if (acc === undefined || acc === null || typeof acc !== "object") return undefined;
      return (acc as Record<string, unknown>)[key];
    }, root);
    return value === undefined || value === null ? match : String(value);
  });
}
