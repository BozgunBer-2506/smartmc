import { HttpStatus } from "@nestjs/common";
import { isRegisteredTrigger, type ActionStep, type ConditionNode, type RuleTrigger } from "@smc/automation-engine";
import { httpError } from "../common/http-error";

/**
 * Manual validation for the rule body's nested jsonb shape (trigger/
 * conditions/actions) - the same pragmatic choice conversations.controller
 * made for its request bodies rather than a deep class-validator tree for
 * a recursive structure. Throws a clear, specific httpError rather than
 * letting a malformed rule reach the database.
 */
export interface RuleInput {
  name: string;
  isEnabled?: boolean;
  priority?: number;
  trigger: RuleTrigger;
  conditions: ConditionNode;
  actions: ActionStep[];
}

function isConditionNode(value: unknown): value is ConditionNode {
  if (typeof value !== "object" || value === null) return false;
  const node = value as Record<string, unknown>;
  if ("op" in node) {
    return (
      (node.op === "AND" || node.op === "OR" || node.op === "NOT") &&
      Array.isArray(node.children) &&
      node.children.every(isConditionNode)
    );
  }
  return typeof node.field === "string" && typeof node.operator === "string";
}

export function validateRuleInput(body: unknown): RuleInput {
  if (typeof body !== "object" || body === null) {
    throw httpError(HttpStatus.BAD_REQUEST, "INVALID_RULE", "Request body must be an object.");
  }
  const input = body as Record<string, unknown>;

  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    throw httpError(HttpStatus.BAD_REQUEST, "NAME_REQUIRED", "A rule name is required.");
  }

  const trigger = input.trigger as RuleTrigger | undefined;
  if (!trigger || typeof trigger.type !== "string" || !isRegisteredTrigger(trigger.type)) {
    throw httpError(
      HttpStatus.BAD_REQUEST,
      "INVALID_TRIGGER",
      `trigger.type must be one of the registered trigger types.`,
    );
  }
  if (trigger.type === "time.no_reply_after" && (!trigger.params || typeof trigger.params.hours !== "number" || trigger.params.hours <= 0)) {
    throw httpError(HttpStatus.BAD_REQUEST, "INVALID_TRIGGER_PARAMS", "time.no_reply_after requires trigger.params.hours > 0.");
  }

  if (!isConditionNode(input.conditions)) {
    throw httpError(HttpStatus.BAD_REQUEST, "INVALID_CONDITIONS", "conditions must be a valid condition tree.");
  }

  if (!Array.isArray(input.actions) || input.actions.length === 0) {
    throw httpError(HttpStatus.BAD_REQUEST, "ACTIONS_REQUIRED", "At least one action is required.");
  }
  for (const action of input.actions) {
    if (typeof action !== "object" || action === null || typeof (action as ActionStep).type !== "string") {
      throw httpError(HttpStatus.BAD_REQUEST, "INVALID_ACTION", "Every action needs a valid type.");
    }
  }

  return {
    name: input.name.trim(),
    isEnabled: typeof input.isEnabled === "boolean" ? input.isEnabled : true,
    priority: typeof input.priority === "number" ? input.priority : 0,
    trigger,
    conditions: input.conditions as ConditionNode,
    actions: input.actions as ActionStep[],
  };
}
