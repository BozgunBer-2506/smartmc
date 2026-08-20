"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@smc/ui";
import {
  createRule,
  deleteRule,
  dryRunRule,
  fetchNotificationPreferences,
  fetchRuleExecutions,
  fetchRules,
  ifMatchForPreferences,
  suggestRule,
  updateNotificationPreferences,
  updateRule,
  type ActionStep,
  type ConditionLeaf,
  type ConditionNode,
  type NotificationPreferences,
  type PublicUser,
  type RuleExecutionLogItem,
  type RuleInput,
  type RuleSummary,
} from "../lib/api";

interface RulesProps {
  accessToken: string;
  user: PublicUser;
  onBack: () => void;
}

const FIELD_OPTIONS = [
  "message.bodyText",
  "sender.isVip",
  "sender.displayName",
  "conversation.isStale:24",
  "workspace.isSilentHours",
];
const OPERATOR_OPTIONS = ["equals", "not_equals", "contains", "not_contains", "matches_regex", "greater_than", "less_than", "is_true", "is_false"];
const ACTION_TYPES = ["notification.send", "tag.apply", "message.send", "webhook.call"];

function actionParamFields(type: string): { key: string; label: string; placeholder: string }[] {
  switch (type) {
    case "notification.send":
      return [
        { key: "title", label: "Title", placeholder: "e.g. VIP message" },
        { key: "body", label: "Body", placeholder: "e.g. {{sender.displayName}} messaged you" },
      ];
    case "tag.apply":
      return [{ key: "tag", label: "Tag", placeholder: "e.g. Urgent" }];
    case "message.send":
      return [{ key: "bodyText", label: "Reply text", placeholder: "e.g. Thanks, I'll get back to you soon." }];
    case "webhook.call":
      return [
        { key: "url", label: "URL", placeholder: "https://..." },
        { key: "body", label: "Body", placeholder: "{{message.bodyText}}" },
      ];
    default:
      return [];
  }
}

function defaultPreferences(): NotificationPreferences {
  return { silentHoursStart: null, silentHoursEnd: null, vipOverrideEnabled: true, keywordAlerts: [] };
}

function emptyLeaf(): ConditionLeaf {
  return { field: FIELD_OPTIONS[0], operator: "is_true", value: "" };
}

function emptyAction(): ActionStep {
  return { type: "notification.send", params: { title: "", body: "" } };
}

const smallButtonClass =
  "rounded-sm border border-border-subtle bg-surface-2 px-2 py-1 text-[11px] text-text-primary hover:border-border-strong";

/**
 * The Automation Engine's UI (docs/AUTOMATION_ENGINE.md Section 7, Phase 10)
 * - a functional form-based rule builder, not the full drag/drop visual
 * canvas Section 7 specifies. Every condition row is combined with one
 * top-level AND/OR (a flat list, not arbitrary nesting) - the stored shape
 * still supports nesting (Section 4.1), so a future richer UI can build on
 * the same rules without a data migration. Disclosed simplification -
 * see docs/reviews/phase-10-review.md.
 *
 * Migrated onto the design system (docs/ROADMAP.md Phase 22.2) - the first
 * real use of the `Select`/`Checkbox` primitives built in Phase 22, and the
 * last of the three screens whose color literals (input/button backgrounds
 * outside the shared token set) are now consolidated onto `surface-1`/
 * `surface-2`. No functional change to create/edit/enable/disable/test/
 * history/AI-suggest/notification-preferences behavior.
 */
export function Rules({ accessToken, user, onBack }: RulesProps) {
  void user;
  const [rules, setRules] = useState<RuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [executions, setExecutions] = useState<Record<string, RuleExecutionLogItem[]>>({});
  const [executionsLoading, setExecutionsLoading] = useState<Record<string, boolean>>({});
  const [executionsError, setExecutionsError] = useState<Record<string, string | null>>({});

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("message.received");
  const [hours, setHours] = useState(48);
  const [providerScope, setProviderScope] = useState("");
  const [conditionOp, setConditionOp] = useState<"AND" | "OR">("AND");
  const [leaves, setLeaves] = useState<ConditionLeaf[]>([emptyLeaf()]);
  const [actions, setActions] = useState<ActionStep[]>([emptyAction()]);
  const [saving, setSaving] = useState(false);

  const [testBody, setTestBody] = useState("This is urgent, please help!");
  const [testSender, setTestSender] = useState("Alex");
  const [testIsVip, setTestIsVip] = useState(false);
  const [testRuleId, setTestRuleId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Awaited<ReturnType<typeof dryRunRule>> | null>(null);
  const [testing, setTesting] = useState(false);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [suggestingRule, setSuggestingRule] = useState(false);

  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [keywordAlertsText, setKeywordAlertsText] = useState("");

  async function load() {
    setLoading(true);
    try {
      setRules(await fetchRules(accessToken));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetchNotificationPreferences(accessToken)
      .then((prefs) => {
        setPreferences(prefs);
        setKeywordAlertsText(prefs.keywordAlerts.join(", "));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSavePreferences() {
    setSavingPreferences(true);
    try {
      const keywordAlerts = keywordAlertsText
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
      const updated = await updateNotificationPreferences(
        accessToken,
        {
          silentHoursStart: preferences?.silentHoursStart || null,
          silentHoursEnd: preferences?.silentHoursEnd || null,
          vipOverrideEnabled: preferences?.vipOverrideEnabled ?? true,
          keywordAlerts,
        },
        ifMatchForPreferences(preferences),
      );
      setPreferences(updated);
      setKeywordAlertsText(updated.keywordAlerts.join(", "));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save notification preferences.");
    } finally {
      setSavingPreferences(false);
    }
  }

  async function handleToggleEnabled(rule: RuleSummary) {
    try {
      await updateRule(accessToken, rule.id, { isEnabled: !rule.isEnabled }, rule.version);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update rule.");
    }
  }

  async function handleDelete(ruleId: string) {
    try {
      await deleteRule(accessToken, ruleId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rule.");
    }
  }

  async function loadExecutions(ruleId: string) {
    setExecutionsLoading((prev) => ({ ...prev, [ruleId]: true }));
    setExecutionsError((prev) => ({ ...prev, [ruleId]: null }));
    try {
      const logs = await fetchRuleExecutions(accessToken, ruleId);
      setExecutions((prev) => ({ ...prev, [ruleId]: logs }));
    } catch (err) {
      setExecutionsError((prev) => ({ ...prev, [ruleId]: err instanceof Error ? err.message : "Failed to load execution history." }));
    } finally {
      setExecutionsLoading((prev) => ({ ...prev, [ruleId]: false }));
    }
  }

  async function handleExpand(rule: RuleSummary) {
    if (expandedId === rule.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(rule.id);
    if (!executions[rule.id]) {
      await loadExecutions(rule.id);
    }
  }

  /** Loads an existing rule into the New Rule form for editing (docs/ROADMAP.md Phase 21.4) - reuses the exact same form/state the create flow already has, no separate edit UI. */
  function handleStartEdit(rule: RuleSummary) {
    setEditingRuleId(rule.id);
    setEditingVersion(rule.version);
    setName(rule.name);
    setTriggerType(rule.trigger.type);
    setHours(rule.trigger.params?.hours ?? 48);
    setProviderScope(rule.trigger.scope?.providerKey ?? "");
    const conditions = rule.conditions;
    if ("field" in conditions) {
      setLeaves([conditions]);
      setConditionOp("AND");
    } else {
      setLeaves(conditions.children.length > 0 ? (conditions.children as ConditionLeaf[]) : [emptyLeaf()]);
      setConditionOp(conditions.op === "OR" ? "OR" : "AND");
    }
    setActions(rule.actions.length > 0 ? rule.actions : [emptyAction()]);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setEditingRuleId(null);
    setEditingVersion(null);
    setName("");
    setTriggerType("message.received");
    setHours(48);
    setProviderScope("");
    setConditionOp("AND");
    setLeaves([emptyLeaf()]);
    setActions([emptyAction()]);
  }

  function updateLeaf(index: number, patch: Partial<ConditionLeaf>) {
    setLeaves((prev) => prev.map((leaf, i) => (i === index ? { ...leaf, ...patch } : leaf)));
  }

  function updateAction(index: number, patch: Partial<ActionStep>) {
    setActions((prev) => prev.map((action, i) => (i === index ? { ...action, ...patch } : action)));
  }

  function updateActionParam(index: number, key: string, value: string) {
    setActions((prev) => prev.map((action, i) => (i === index ? { ...action, params: { ...action.params, [key]: value } } : action)));
  }

  /** AI-suggested rule (docs/AUTOMATION_ENGINE.md Section 8, ADR-0021) - fills the New Rule form below with a draft; nothing is created until the user reviews and clicks "Create rule" themselves. */
  async function handleSuggestRule() {
    if (!aiPrompt.trim()) return;
    setSuggestingRule(true);
    setAiNote(null);
    try {
      const result = await suggestRule(accessToken, aiPrompt.trim());
      if (!result.matched || !result.draft) {
        setAiNote(result.note ?? "Could not map this prompt to a rule.");
        return;
      }
      const draft = result.draft;
      setName(draft.name);
      setTriggerType(draft.trigger.type);
      setHours(draft.trigger.params?.hours ?? 48);
      setProviderScope(draft.trigger.scope?.providerKey ?? "");
      const conditions = draft.conditions as ConditionNode;
      if ("field" in conditions) {
        setLeaves([conditions]);
      } else if (conditions.children.length === 0) {
        setLeaves([emptyLeaf()]);
      } else {
        setLeaves(conditions.children as ConditionLeaf[]);
        setConditionOp(conditions.op === "OR" ? "OR" : "AND");
      }
      setActions(draft.actions);
      setAiNote(`Draft filled in below from: "${aiPrompt.trim()}" - review and click "Create rule" to activate it.`);
    } catch (err) {
      setAiNote(err instanceof Error ? err.message : "AI rule suggestion failed.");
    } finally {
      setSuggestingRule(false);
    }
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError("A rule name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input: RuleInput = {
        name: name.trim(),
        isEnabled: true,
        priority: 0,
        trigger: {
          type: triggerType,
          scope: providerScope ? { providerKey: providerScope } : undefined,
          params: triggerType === "time.no_reply_after" ? { hours } : undefined,
        },
        conditions: leaves.length === 1 ? leaves[0] : { op: conditionOp, children: leaves },
        actions,
      };
      if (editingRuleId && editingVersion !== null) {
        await updateRule(accessToken, editingRuleId, input, editingVersion);
        handleCancelEdit();
      } else {
        await createRule(accessToken, input);
        setName("");
        setLeaves([emptyLeaf()]);
        setActions([emptyAction()]);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : editingRuleId ? "Failed to save rule." : "Failed to create rule.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!testRuleId) return;
    setTesting(true);
    try {
      const result = await dryRunRule(accessToken, testRuleId, {
        bodyText: testBody,
        senderDisplayName: testSender,
        senderIsVip: testIsVip,
      });
      setTestResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test run failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <main className="mx-auto max-w-[900px] p-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h1 className="m-0 text-xl font-semibold text-text-primary">Automations</h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            Rules that react to incoming messages and elapsed time - docs/AUTOMATION_ENGINE.md
          </p>
        </div>
        <Button onClick={onBack}>Back to Inbox</Button>
      </header>

      {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

      <Card className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-text-secondary">Notification preferences</h2>
        <p className="mb-2.5 text-xs text-text-secondary">
          Silent hours suppress the default &quot;notify me&quot; rule unless the sender is VIP (and VIP override is on) or the message matches a keyword alert below.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-text-secondary">
            Silent from
            <Input
              className="ml-1.5 w-auto"
              type="time"
              value={preferences?.silentHoursStart ?? ""}
              onChange={(e) => setPreferences((p) => ({ ...(p ?? defaultPreferences()), silentHoursStart: e.target.value || null }))}
            />
          </label>
          <label className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-text-secondary">
            until
            <Input
              className="ml-1.5 w-auto"
              type="time"
              value={preferences?.silentHoursEnd ?? ""}
              onChange={(e) => setPreferences((p) => ({ ...(p ?? defaultPreferences()), silentHoursEnd: e.target.value || null }))}
            />
          </label>
          <label className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-text-secondary">
            <Checkbox
              checked={preferences?.vipOverrideEnabled ?? true}
              onCheckedChange={(checked) => setPreferences((p) => ({ ...(p ?? defaultPreferences()), vipOverrideEnabled: checked === true }))}
            />
            VIP senders break through silent hours
          </label>
        </div>
        <div className="mt-2">
          <Input
            className="w-full"
            placeholder="Keyword alerts, comma-separated (e.g. urgent, outage, invoice)"
            value={keywordAlertsText}
            onChange={(e) => setKeywordAlertsText(e.target.value)}
          />
        </div>
        <div className="mt-2.5">
          <Button onClick={handleSavePreferences} disabled={savingPreferences}>
            {savingPreferences ? "Saving..." : "Save preferences"}
          </Button>
        </div>
      </Card>

      <Card className="mb-6 border-status-info">
        <h2 className="mb-2 text-sm font-semibold text-text-secondary">Suggest a rule with AI</h2>
        <p className="mb-2 text-xs text-text-secondary">
          Describe the rule in plain language - it only fills the form below as a draft; nothing is created until you review it and click &quot;Create rule&quot;.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Input
            className="min-w-[200px] flex-1"
            placeholder={'e.g. "notify me if a VIP messages" or "remind me if no reply in 2 days"'}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <Button onClick={handleSuggestRule} disabled={suggestingRule}>
            {suggestingRule ? "Thinking..." : "Suggest"}
          </Button>
        </div>
        {aiNote && <p className="mt-1.5 text-xs text-text-secondary">{aiNote}</p>}
      </Card>

      <Card className={`mb-6 ${editingRuleId ? "border-accent-priority" : ""}`}>
        <h2 className="mb-2 text-sm font-semibold text-text-secondary">{editingRuleId ? "Edit rule" : "New rule"}</h2>
        <div className="flex flex-col gap-3">
          <Input placeholder="Rule name (e.g. Notify me on VIP messages)" value={name} onChange={(e) => setName(e.target.value)} />

          <div className="flex flex-wrap gap-2">
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger className="w-auto min-w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="message.received">Trigger: message received</SelectItem>
                <SelectItem value="time.no_reply_after">Trigger: no reply after N hours</SelectItem>
              </SelectContent>
            </Select>
            {triggerType === "time.no_reply_after" && (
              <Input
                className="w-[100px]"
                type="number"
                min={1}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                placeholder="Hours"
              />
            )}
            <Input
              className="flex-[1_1_160px]"
              placeholder="Only for provider (optional, e.g. telegram)"
              value={providerScope}
              onChange={(e) => setProviderScope(e.target.value)}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-sm font-semibold text-text-secondary">Conditions</span>
              {leaves.length > 1 && (
                <Select value={conditionOp} onValueChange={(value) => setConditionOp(value as "AND" | "OR")}>
                  <SelectTrigger className="h-7 w-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">match ALL</SelectItem>
                    <SelectItem value="OR">match ANY</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            {leaves.map((leaf, i) => (
              <div key={i} className="mb-1.5 flex flex-wrap gap-1.5">
                <Select value={leaf.field} onValueChange={(value) => updateLeaf(i, { field: value })}>
                  <SelectTrigger className="w-auto min-w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={leaf.operator} onValueChange={(value) => updateLeaf(i, { operator: value })}>
                  <SelectTrigger className="w-auto min-w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATOR_OPTIONS.map((op) => (
                      <SelectItem key={op} value={op}>
                        {op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {leaf.operator !== "is_true" && leaf.operator !== "is_false" && (
                  <Input
                    className="flex-[1_1_140px]"
                    placeholder="value"
                    value={String(leaf.value ?? "")}
                    onChange={(e) => updateLeaf(i, { value: e.target.value })}
                  />
                )}
                <button type="button" className={smallButtonClass} onClick={() => setLeaves((prev) => prev.filter((_, idx) => idx !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className={smallButtonClass} onClick={() => setLeaves((prev) => [...prev, emptyLeaf()])}>
              + Add condition
            </button>
          </div>

          <div>
            <span className="text-sm font-semibold text-text-secondary">Actions</span>
            {actions.map((action, i) => (
              <div key={i} className="mb-1.5 rounded-md border border-border-subtle p-2">
                <div className="mb-1.5 flex gap-1.5">
                  <Select
                    value={action.type}
                    onValueChange={(type) => {
                      const params: Record<string, string> = {};
                      for (const f of actionParamFields(type)) params[f.key] = "";
                      updateAction(i, { type, params });
                    }}
                  >
                    <SelectTrigger className="w-auto min-w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button type="button" className={smallButtonClass} onClick={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}>
                    Remove
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {actionParamFields(action.type).map((f) => (
                    <Input
                      key={f.key}
                      className="flex-[1_1_160px]"
                      placeholder={`${f.label}: ${f.placeholder}`}
                      value={action.params[f.key] ?? ""}
                      onChange={(e) => updateActionParam(i, f.key, e.target.value)}
                    />
                  ))}
                </div>
              </div>
            ))}
            <button type="button" className={smallButtonClass} onClick={() => setActions((prev) => [...prev, emptyAction()])}>
              + Add action
            </button>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Saving..." : editingRuleId ? "Save changes" : "Create rule"}
            </Button>
            {editingRuleId && (
              <button type="button" className={smallButtonClass} onClick={handleCancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-secondary">Your rules</h2>
        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        )}
        {!loading && rules.length === 0 && <p className="text-[13px] text-text-secondary">No rules yet - create one above.</p>}
        {!loading &&
          rules.map((rule) => (
            <Card key={rule.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong>{rule.name}</strong>
                  <div className="mt-0.5 text-xs text-text-secondary">
                    {rule.triggerType}
                    {rule.trigger.params?.hours ? ` (${rule.trigger.params.hours}h)` : ""} · v{rule.version}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={smallButtonClass} onClick={() => handleToggleEnabled(rule)}>
                    {rule.isEnabled ? "Disable" : "Enable"}
                  </button>
                  <button type="button" className={smallButtonClass} onClick={() => handleStartEdit(rule)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={smallButtonClass}
                    onClick={() => {
                      setTestRuleId(rule.id);
                      setTestResult(null);
                    }}
                  >
                    Test
                  </button>
                  <button type="button" className={smallButtonClass} onClick={() => handleExpand(rule)}>
                    {expandedId === rule.id ? "Hide history" : "History"}
                  </button>
                  <button type="button" className={`${smallButtonClass} text-status-danger`} onClick={() => handleDelete(rule.id)}>
                    Delete
                  </button>
                </div>
              </div>

              {expandedId === rule.id && (
                <div className="mt-2.5 border-t border-border-subtle pt-2.5">
                  {executionsLoading[rule.id] && (
                    <div className="space-y-1.5">
                      <Skeleton className="h-8" />
                      <Skeleton className="h-8" />
                    </div>
                  )}
                  {!executionsLoading[rule.id] && executionsError[rule.id] && (
                    <div className="text-xs text-status-danger">
                      Could not load execution history: {executionsError[rule.id]}{" "}
                      <button onClick={() => loadExecutions(rule.id)} className={`${smallButtonClass} ml-1.5`}>
                        Retry
                      </button>
                    </div>
                  )}
                  {!executionsLoading[rule.id] && !executionsError[rule.id] && (executions[rule.id] ?? []).length === 0 && (
                    <p className="text-xs text-text-secondary">No executions yet.</p>
                  )}
                  {!executionsLoading[rule.id] &&
                    !executionsError[rule.id] &&
                    (executions[rule.id] ?? []).map((log) => (
                      <div key={log.id} className="mb-2 border-b border-surface-2 pb-2 text-xs text-text-secondary">
                        <div>
                          {new Date(log.matchedAt).toLocaleString()} -{" "}
                          <strong
                            className={
                              log.status === "success"
                                ? "text-status-success"
                                : log.status === "partial_failure"
                                  ? "text-status-warning"
                                  : "text-status-danger"
                            }
                          >
                            {log.status}
                          </strong>
                        </div>
                        {log.status !== "success" && log.errorDetail && <div className="mt-0.5 text-status-danger">{log.errorDetail}</div>}
                        {log.actionsExecuted.map((a, i) => (
                          <div key={i} className="mt-0.5 pl-2">
                            <span className={a.status === "success" ? "text-status-success" : "text-status-danger"}>
                              {a.type}: {a.status}
                            </span>
                            {a.error && <span className="text-status-danger"> - {a.error}</span>}
                            {a.output !== undefined && a.status === "success" && (
                              <span className="text-text-disabled"> - {JSON.stringify(a.output)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                </div>
              )}
            </Card>
          ))}
      </section>

      {testRuleId && (
        <Card className="mt-4 border-accent-priority">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">Test rule (no real side effects)</h2>
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Input className="flex-[2_1_220px]" placeholder="Sample message body" value={testBody} onChange={(e) => setTestBody(e.target.value)} />
            <Input className="flex-[1_1_140px]" placeholder="Sample sender name" value={testSender} onChange={(e) => setTestSender(e.target.value)} />
            <label className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-text-secondary">
              <Checkbox checked={testIsVip} onCheckedChange={(checked) => setTestIsVip(checked === true)} /> VIP
            </label>
            <Button onClick={handleTest} disabled={testing}>
              {testing ? "Running..." : "Run test"}
            </Button>
          </div>
          {testResult && (
            <div className="text-[13px]">
              <div>
                Matched: <strong className={testResult.matched ? "text-status-success" : "text-status-danger"}>{testResult.matched ? "yes" : "no"}</strong>
              </div>
              {testResult.actionsExecuted.map((a, i) => (
                <div key={i} className="text-text-secondary">
                  {a.type}: {a.status} {a.output ? `- ${JSON.stringify(a.output)}` : a.error ?? ""}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </main>
  );
}
