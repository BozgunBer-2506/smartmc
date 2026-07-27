import { interpolate } from "./variables";
import type { ActionPorts, ActionResult, ActionStep, ContextObject } from "./types";
import { ActionType } from "./types";

/** Executes one action step against the injected ports, rendering `{{...}}` variables in every string param first (AUTOMATION_ENGINE.md Section 4.3). Never throws - a failing action becomes an `error` ActionResult so the caller can record partial success (Section 5.4) instead of aborting the whole chain. */
async function executeStep(step: ActionStep, context: ContextObject, ports: ActionPorts): Promise<ActionResult> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(step.params)) {
    params[key] = interpolate(value, context);
  }

  try {
    switch (step.type) {
      case ActionType.NOTIFICATION_SEND: {
        const result = await ports.sendNotification({ title: params.title ?? "Automation", body: params.body ?? "" });
        return { type: step.type, status: "success", output: result };
      }
      case ActionType.TAG_APPLY: {
        if (!params.tag) return { type: step.type, status: "error", error: "tag param is required" };
        const result = await ports.applyTag({ tag: params.tag });
        return { type: step.type, status: "success", output: result };
      }
      case ActionType.MESSAGE_SEND: {
        if (!params.bodyText) return { type: step.type, status: "error", error: "bodyText param is required" };
        const result = await ports.sendMessage({ bodyText: params.bodyText });
        return { type: step.type, status: "success", output: result };
      }
      case ActionType.WEBHOOK_CALL: {
        if (!params.url) return { type: step.type, status: "error", error: "url param is required" };
        const result = await ports.callWebhook({ url: params.url, body: params.body ?? "" });
        return { type: step.type, status: "success", output: result };
      }
      default:
        return { type: step.type, status: "error", error: `Unregistered action type "${step.type}"` };
    }
  } catch (err) {
    return { type: step.type, status: "error", error: err instanceof Error ? err.message : "Action failed" };
  }
}

/**
 * Runs a rule's action chain (AUTOMATION_ENGINE.md Section 5.2) purely
 * sequentially - conditional branching, parallel execution, and delayed
 * in-chain steps are all deferred (Section 5.2's fuller graph model),
 * since Phase 10 has no multi-step context (`{{steps.N.output}}`) for a
 * branch to condition on yet. Every step still runs even if an earlier one
 * fails - partial success is the point (Section 5.4), not fail-fast.
 */
export async function executeActions(
  steps: ActionStep[],
  context: ContextObject,
  ports: ActionPorts,
): Promise<{ status: "success" | "partial_failure" | "failure"; actionsExecuted: ActionResult[] }> {
  const actionsExecuted: ActionResult[] = [];
  for (const step of steps) {
    actionsExecuted.push(await executeStep(step, context, ports));
  }

  const successCount = actionsExecuted.filter((a) => a.status === "success").length;
  const status =
    successCount === actionsExecuted.length ? "success" : successCount === 0 ? "failure" : "partial_failure";

  return { status, actionsExecuted };
}
