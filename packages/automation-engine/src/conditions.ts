import type { ConditionNode, ConditionOperator, ContextObject } from "./types";
import { isConditionGroup } from "./types";

/** Resolves a dot-path field reference (AUTOMATION_ENGINE.md Section 4.1) against the Context Object. `conversation.isStale(N)` is the one callable primitive (Section 4.2) - encoded here as `conversation.isStale:<hours>` since Phase 10's condition leaves carry no argument list, only a field path and a value. */
function resolveField(field: string, context: ContextObject): unknown {
  if (field.startsWith("conversation.isStale:")) {
    const hours = Number(field.split(":")[1]);
    return context.conversation.isStale(hours);
  }

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
      return undefined;
  }
  if (root === undefined || root === null) return undefined;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === undefined || acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, root);
}

function evaluateOperator(operator: ConditionOperator, actual: unknown, expected: unknown): boolean {
  switch (operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "contains":
      return typeof actual === "string" && typeof expected === "string" && actual.toLowerCase().includes(expected.toLowerCase());
    case "not_contains":
      return !(typeof actual === "string" && typeof expected === "string" && actual.toLowerCase().includes(expected.toLowerCase()));
    case "matches_regex":
      return typeof actual === "string" && typeof expected === "string" && new RegExp(expected).test(actual);
    case "greater_than":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "less_than":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "is_true":
      return actual === true;
    case "is_false":
      return actual === false;
    default:
      return false;
  }
}

/** Evaluates a nested AND/OR/NOT condition tree (AUTOMATION_ENGINE.md Section 4.1) against a Context Object. A field that resolves to `undefined` (e.g. `message.bodyText` on a trigger with no message) makes every operator false rather than throwing - a rule referencing data its trigger doesn't guarantee simply never matches, matching Section 3.2's declared-context-requirements intent without the visual builder's compile-time enforcement (deferred). */
export function evaluateConditionTree(node: ConditionNode, context: ContextObject): boolean {
  if (isConditionGroup(node)) {
    if (node.op === "AND") return node.children.every((child) => evaluateConditionTree(child, context));
    if (node.op === "OR") return node.children.some((child) => evaluateConditionTree(child, context));
    // NOT: negates the single child (or the AND of all children if more than one was given)
    return !node.children.every((child) => evaluateConditionTree(child, context));
  }
  const actual = resolveField(node.field, context);
  return evaluateOperator(node.operator, actual, node.value);
}
