"use client";

import { useEffect, useState } from "react";
import { Button } from "@smc/ui";
import {
  createRule,
  deleteRule,
  dryRunRule,
  fetchNotificationPreferences,
  fetchRuleExecutions,
  fetchRules,
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

/**
 * The Automation Engine's UI (docs/AUTOMATION_ENGINE.md Section 7, Phase 10)
 * - a functional form-based rule builder, not the full drag/drop visual
 * canvas Section 7 specifies. Every condition row is combined with one
 * top-level AND/OR (a flat list, not arbitrary nesting) - the stored shape
 * still supports nesting (Section 4.1), so a future richer UI can build on
 * the same rules without a data migration. Disclosed simplification -
 * see docs/reviews/phase-10-review.md.
 */
export function Rules({ accessToken, user, onBack }: RulesProps) {
  void user;
  const [rules, setRules] = useState<RuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [executions, setExecutions] = useState<Record<string, RuleExecutionLogItem[]>>({});

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
      const updated = await updateNotificationPreferences(accessToken, {
        silentHoursStart: preferences?.silentHoursStart || null,
        silentHoursEnd: preferences?.silentHoursEnd || null,
        vipOverrideEnabled: preferences?.vipOverrideEnabled ?? true,
        keywordAlerts,
      });
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
      await updateRule(accessToken, rule.id, { isEnabled: !rule.isEnabled });
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

  async function handleExpand(rule: RuleSummary) {
    if (expandedId === rule.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(rule.id);
    if (!executions[rule.id]) {
      try {
        const logs = await fetchRuleExecutions(accessToken, rule.id);
        setExecutions((prev) => ({ ...prev, [rule.id]: logs }));
      } catch {
        // Non-fatal - the expanded panel just shows no history.
      }
    }
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
      await createRule(accessToken, input);
      setName("");
      setLeaves([emptyLeaf()]);
      setActions([emptyAction()]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule.");
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
    <main className="automations-main" style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
      <style>{`
        @media (max-width: 720px) {
          .automations-main { padding: 16px !important; }
          .automations-header { flex-wrap: wrap; gap: 10px; }
          .automations-toolbar { flex-wrap: wrap; }
        }
      `}</style>
      <header className="automations-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Automations</h1>
          <p style={{ color: "#9AA5B1", fontSize: 13, margin: "4px 0 0" }}>
            Rules that react to incoming messages and elapsed time - docs/AUTOMATION_ENGINE.md
          </p>
        </div>
        <Button onClick={onBack}>Back to Inbox</Button>
      </header>

      {error && (
        <div style={{ ...cardStyle, borderColor: "#E05252", color: "#E05252", marginBottom: 16 }}>{error}</div>
      )}

      <section style={{ ...cardStyle, marginBottom: 24 }}>
        <h2 style={sectionHeading}>Notification preferences</h2>
        <p style={{ fontSize: 12, color: "#9AA5B1", margin: "0 0 10px" }}>
          Silent hours suppress the default &quot;notify me&quot; rule unless the sender is VIP (and VIP override is on) or the message matches a keyword alert below.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label style={filterLabelStyle}>
            Silent from
            <input
              style={{ ...inputStyle, marginLeft: 6 }}
              type="time"
              value={preferences?.silentHoursStart ?? ""}
              onChange={(e) => setPreferences((p) => ({ ...(p ?? defaultPreferences()), silentHoursStart: e.target.value || null }))}
            />
          </label>
          <label style={filterLabelStyle}>
            until
            <input
              style={{ ...inputStyle, marginLeft: 6 }}
              type="time"
              value={preferences?.silentHoursEnd ?? ""}
              onChange={(e) => setPreferences((p) => ({ ...(p ?? defaultPreferences()), silentHoursEnd: e.target.value || null }))}
            />
          </label>
          <label style={filterLabelStyle}>
            <input
              type="checkbox"
              checked={preferences?.vipOverrideEnabled ?? true}
              onChange={(e) => setPreferences((p) => ({ ...(p ?? defaultPreferences()), vipOverrideEnabled: e.target.checked }))}
            />{" "}
            VIP senders break through silent hours
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <input
            style={{ ...inputStyle, width: "100%" }}
            placeholder="Keyword alerts, comma-separated (e.g. urgent, outage, invoice)"
            value={keywordAlertsText}
            onChange={(e) => setKeywordAlertsText(e.target.value)}
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <Button onClick={handleSavePreferences} disabled={savingPreferences}>
            {savingPreferences ? "Saving..." : "Save preferences"}
          </Button>
        </div>
      </section>

      <section style={{ ...cardStyle, marginBottom: 24, borderColor: "#5B8DEF" }}>
        <h2 style={sectionHeading}>Suggest a rule with AI</h2>
        <p style={{ fontSize: 12, color: "#9AA5B1", margin: "0 0 8px" }}>
          Describe the rule in plain language - it only fills the form below as a draft; nothing is created until you review it and click &quot;Create rule&quot;.
        </p>
        <div className="automations-toolbar" style={{ display: "flex", gap: 6 }}>
          <input
            style={{ ...inputStyle, flex: 1, minWidth: 200 }}
            placeholder={'e.g. "notify me if a VIP messages" or "remind me if no reply in 2 days"'}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <Button onClick={handleSuggestRule} disabled={suggestingRule}>
            {suggestingRule ? "Thinking..." : "Suggest"}
          </Button>
        </div>
        {aiNote && <p style={{ fontSize: 12, color: "#9AA5B1", marginTop: 6 }}>{aiNote}</p>}
      </section>

      <section style={{ ...cardStyle, marginBottom: 24 }}>
        <h2 style={sectionHeading}>New rule</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input style={inputStyle} placeholder="Rule name (e.g. Notify me on VIP messages)" value={name} onChange={(e) => setName(e.target.value)} />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select style={inputStyle} value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
              <option value="message.received">Trigger: message received</option>
              <option value="time.no_reply_after">Trigger: no reply after N hours</option>
            </select>
            {triggerType === "time.no_reply_after" && (
              <input
                style={{ ...inputStyle, width: 100 }}
                type="number"
                min={1}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                placeholder="Hours"
              />
            )}
            <input
              style={{ ...inputStyle, flex: "1 1 160px" }}
              placeholder="Only for provider (optional, e.g. telegram)"
              value={providerScope}
              onChange={(e) => setProviderScope(e.target.value)}
            />
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={sectionHeading}>Conditions</span>
              {leaves.length > 1 && (
                <select style={{ ...inputStyle, padding: "2px 6px" }} value={conditionOp} onChange={(e) => setConditionOp(e.target.value as "AND" | "OR")}>
                  <option value="AND">match ALL</option>
                  <option value="OR">match ANY</option>
                </select>
              )}
            </div>
            {leaves.map((leaf, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                <select style={inputStyle} value={leaf.field} onChange={(e) => updateLeaf(i, { field: e.target.value })}>
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <select style={inputStyle} value={leaf.operator} onChange={(e) => updateLeaf(i, { operator: e.target.value })}>
                  {OPERATOR_OPTIONS.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                {leaf.operator !== "is_true" && leaf.operator !== "is_false" && (
                  <input
                    style={{ ...inputStyle, flex: "1 1 140px" }}
                    placeholder="value"
                    value={String(leaf.value ?? "")}
                    onChange={(e) => updateLeaf(i, { value: e.target.value })}
                  />
                )}
                <button type="button" style={smallButtonStyle} onClick={() => setLeaves((prev) => prev.filter((_, idx) => idx !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" style={smallButtonStyle} onClick={() => setLeaves((prev) => [...prev, emptyLeaf()])}>
              + Add condition
            </button>
          </div>

          <div>
            <span style={sectionHeading}>Actions</span>
            {actions.map((action, i) => (
              <div key={i} style={{ border: "1px solid #2A3441", borderRadius: 6, padding: 8, marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <select
                    style={inputStyle}
                    value={action.type}
                    onChange={(e) => {
                      const type = e.target.value;
                      const params: Record<string, string> = {};
                      for (const f of actionParamFields(type)) params[f.key] = "";
                      updateAction(i, { type, params });
                    }}
                  >
                    {ACTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button type="button" style={smallButtonStyle} onClick={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}>
                    Remove
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {actionParamFields(action.type).map((f) => (
                    <input
                      key={f.key}
                      style={{ ...inputStyle, flex: "1 1 160px" }}
                      placeholder={`${f.label}: ${f.placeholder}`}
                      value={action.params[f.key] ?? ""}
                      onChange={(e) => updateActionParam(i, f.key, e.target.value)}
                    />
                  ))}
                </div>
              </div>
            ))}
            <button type="button" style={smallButtonStyle} onClick={() => setActions((prev) => [...prev, emptyAction()])}>
              + Add action
            </button>
          </div>

          <div>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Saving..." : "Create rule"}
            </Button>
          </div>
        </div>
      </section>

      <section>
        <h2 style={sectionHeading}>Your rules {loading && "(loading...)"}</h2>
        {rules.length === 0 && !loading && <p style={{ color: "#9AA5B1", fontSize: 13 }}>No rules yet - create one above.</p>}
        {rules.map((rule) => (
          <div key={rule.id} style={cardStyle}>
            <div className="automations-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <strong>{rule.name}</strong>
                <div style={{ fontSize: 12, color: "#9AA5B1", marginTop: 2 }}>
                  {rule.triggerType}
                  {rule.trigger.params?.hours ? ` (${rule.trigger.params.hours}h)` : ""} · v{rule.version}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" style={smallButtonStyle} onClick={() => handleToggleEnabled(rule)}>
                  {rule.isEnabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  style={smallButtonStyle}
                  onClick={() => {
                    setTestRuleId(rule.id);
                    setTestResult(null);
                  }}
                >
                  Test
                </button>
                <button type="button" style={smallButtonStyle} onClick={() => handleExpand(rule)}>
                  {expandedId === rule.id ? "Hide history" : "History"}
                </button>
                <button type="button" style={{ ...smallButtonStyle, color: "#E05252" }} onClick={() => handleDelete(rule.id)}>
                  Delete
                </button>
              </div>
            </div>

            {expandedId === rule.id && (
              <div style={{ marginTop: 10, borderTop: "1px solid #2A3441", paddingTop: 10 }}>
                {(executions[rule.id] ?? []).length === 0 && <p style={{ fontSize: 12, color: "#9AA5B1" }}>No executions yet.</p>}
                {(executions[rule.id] ?? []).map((log) => (
                  <div key={log.id} style={{ fontSize: 12, color: "#9AA5B1", marginBottom: 4 }}>
                    {new Date(log.matchedAt).toLocaleString()} - <strong style={{ color: log.status === "success" ? "#3FB27F" : log.status === "partial_failure" ? "#E0A458" : "#E05252" }}>{log.status}</strong>{" "}
                    ({log.actionsExecuted.map((a) => a.type).join(", ")})
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {testRuleId && (
        <section style={{ ...cardStyle, marginTop: 16, borderColor: "#E0A458" }}>
          <h2 style={sectionHeading}>Test rule (no real side effects)</h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <input style={{ ...inputStyle, flex: "2 1 220px" }} placeholder="Sample message body" value={testBody} onChange={(e) => setTestBody(e.target.value)} />
            <input style={{ ...inputStyle, flex: "1 1 140px" }} placeholder="Sample sender name" value={testSender} onChange={(e) => setTestSender(e.target.value)} />
            <label style={filterLabelStyle}>
              <input type="checkbox" checked={testIsVip} onChange={(e) => setTestIsVip(e.target.checked)} /> VIP
            </label>
            <Button onClick={handleTest} disabled={testing}>
              {testing ? "Running..." : "Run test"}
            </Button>
          </div>
          {testResult && (
            <div style={{ fontSize: 13 }}>
              <div>
                Matched: <strong style={{ color: testResult.matched ? "#3FB27F" : "#E05252" }}>{testResult.matched ? "yes" : "no"}</strong>
              </div>
              {testResult.actionsExecuted.map((a, i) => (
                <div key={i} style={{ color: "#9AA5B1" }}>
                  {a.type}: {a.status} {a.output ? `- ${JSON.stringify(a.output)}` : a.error ?? ""}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

const cardStyle: React.CSSProperties = { border: "1px solid #2A3441", borderRadius: 8, padding: 12, marginBottom: 8, background: "#111726" };
const sectionHeading: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: "#9AA5B1", margin: "0 0 8px" };
const smallButtonStyle: React.CSSProperties = { fontSize: 11, padding: "4px 8px", borderRadius: 4, border: "1px solid #2A3441", background: "#1B2333", color: "#F5F7FA", cursor: "pointer" };
const inputStyle: React.CSSProperties = { padding: 8, borderRadius: 6, border: "1px solid #2A3441", background: "#0B0F17", color: "#F5F7FA" };
const filterLabelStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 8px", borderRadius: 6, color: "#9AA5B1", fontSize: 13 };
