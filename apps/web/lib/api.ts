const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

export interface ProblemDetails {
  title: string;
  detail?: string;
  code: string;
  status: number;
  /** Field-level validation errors (API.md Section 5's RFC 7807 `errors` array) - the actually useful message for a VALIDATION_ERROR response; `detail` is never set for these, only `title` ("Bad Request Exception"), which is not helpful on its own. */
  errors?: { field: string; code: string; message: string }[] | null;
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    const problem = body as ProblemDetails;
    const validationMessage = problem.errors?.map((e) => e.message).join(" ");
    throw new Error(validationMessage || problem.detail || problem.title || `Request failed (${res.status})`);
  }
  return body as T;
}

export async function register(email: string, password: string, displayName?: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // required for the httpOnly refresh cookie to be set (docs/API.md Section 7.1)
    body: JSON.stringify({ email, password, displayName }),
  });
  return parseOrThrow<AuthResponse>(res);
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  return parseOrThrow<AuthResponse>(res);
}

/** Attempts to re-establish a session from the httpOnly refresh cookie alone - lets a page reload skip re-login, matching real session semantics rather than losing state on every refresh. */
export async function tryRefresh(): Promise<{ accessToken: string } | null> {
  try {
    const res = await fetch(`${API_URL}/v1/auth/refresh`, { method: "POST", credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as { accessToken: string };
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/v1/auth/logout`, { method: "POST", credentials: "include" });
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  providerKey: string;
  lastMessageAt: string | null;
  priorityScore: number;
  isArchived: boolean;
  category: string | null;
  unread: boolean;
  lastMessage: {
    id: string;
    bodyText: string;
    direction: string;
    receivedAt: string;
    sender: { id: string; displayName: string | null; isVip: boolean } | null;
  } | null;
}

export interface ConversationListFilters {
  archived?: boolean;
  category?: string;
  vip?: boolean;
  unread?: boolean;
}

export interface MergeSuggestion {
  id: string;
  confidenceScore: number;
  matchingSignals: { reason: string; normalizedNameA: string; normalizedNameB: string };
  contactA: { id: string; displayName: string | null } | null;
  contactB: { id: string; displayName: string | null } | null;
  createdAt: string;
  expiresAt: string;
}

export interface ConversationMessage {
  id: string;
  direction: string;
  bodyText: string;
  receivedAt: string;
  sender: { id: string; displayName: string | null; isVip: boolean } | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
}

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export interface MeResponse {
  user: PublicUser;
  workspaces: Array<{ workspaceId: string; workspaceName: string; organizationId: string; role: string }>;
}

export async function fetchMe(accessToken: string): Promise<MeResponse> {
  const res = await fetch(`${API_URL}/v1/users/me`, { headers: authHeaders(accessToken) });
  return parseOrThrow<MeResponse>(res);
}

export async function fetchConversations(accessToken: string, filters: ConversationListFilters = {}): Promise<ConversationSummary[]> {
  const params = new URLSearchParams();
  if (filters.archived !== undefined) params.set("archived", String(filters.archived));
  if (filters.category) params.set("category", filters.category);
  if (filters.vip) params.set("vip", "true");
  if (filters.unread) params.set("unread", "true");
  const query = params.toString();
  const res = await fetch(`${API_URL}/v1/conversations${query ? `?${query}` : ""}`, { headers: authHeaders(accessToken) });
  return parseOrThrow<ConversationSummary[]>(res);
}

export async function fetchNeedsYouCount(accessToken: string): Promise<{ needsYouCount: number }> {
  const res = await fetch(`${API_URL}/v1/conversations/summary`, { headers: authHeaders(accessToken) });
  return parseOrThrow<{ needsYouCount: number }>(res);
}

export async function updateConversation(
  accessToken: string,
  conversationId: string,
  input: { isArchived?: boolean; category?: string | null },
): Promise<{ id: string; isArchived: boolean; category: string | null }> {
  const res = await fetch(`${API_URL}/v1/conversations/${conversationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify(input),
  });
  return parseOrThrow(res);
}

export async function markConversationRead(accessToken: string, conversationId: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/read`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  await parseOrThrow(res);
}

export async function fetchMergeSuggestions(accessToken: string): Promise<MergeSuggestion[]> {
  const res = await fetch(`${API_URL}/v1/identity/merge-suggestions`, { headers: authHeaders(accessToken) });
  return parseOrThrow<MergeSuggestion[]>(res);
}

export async function approveMergeSuggestion(accessToken: string, suggestionId: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/identity/merge-suggestions/${suggestionId}/approve`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  await parseOrThrow(res);
}

export async function rejectMergeSuggestion(accessToken: string, suggestionId: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/identity/merge-suggestions/${suggestionId}/reject`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  await parseOrThrow(res);
}

export async function fetchMessages(accessToken: string, conversationId: string): Promise<ConversationMessage[]> {
  const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
    headers: authHeaders(accessToken),
  });
  return parseOrThrow<ConversationMessage[]>(res);
}

export async function fetchNotifications(accessToken: string): Promise<NotificationItem[]> {
  const res = await fetch(`${API_URL}/v1/notifications`, { headers: authHeaders(accessToken) });
  return parseOrThrow<NotificationItem[]>(res);
}

export async function sendMessage(accessToken: string, conversationId: string, body: string): Promise<ConversationMessage> {
  const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ body }),
  });
  return parseOrThrow<ConversationMessage>(res);
}

export async function connectDiscord(accessToken: string): Promise<{ authorizationUrl: string }> {
  const res = await fetch(`${API_URL}/v1/connectors/discord/connect`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  return parseOrThrow<{ authorizationUrl: string }>(res);
}

export async function connectSlack(accessToken: string): Promise<{ authorizationUrl: string }> {
  const res = await fetch(`${API_URL}/v1/connectors/slack/connect`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });
  return parseOrThrow<{ authorizationUrl: string }>(res);
}

export interface ConnectTelegramResult {
  id: string;
  status: string;
  providerKey: string;
  externalAccountId: string;
  webhookRegistered: boolean;
}

export async function connectTelegram(accessToken: string, botToken: string): Promise<ConnectTelegramResult> {
  const res = await fetch(`${API_URL}/v1/connectors/telegram/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify({ botToken }),
  });
  return parseOrThrow<ConnectTelegramResult>(res);
}

export interface ConnectEmailInput {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
}

export interface ConnectEmailResult {
  id: string;
  status: string;
  providerKey: string;
  externalAccountId: string;
}

export async function connectEmail(accessToken: string, input: ConnectEmailInput): Promise<ConnectEmailResult> {
  const res = await fetch(`${API_URL}/v1/connectors/email/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify(input),
  });
  return parseOrThrow<ConnectEmailResult>(res);
}

export interface ConditionLeaf {
  field: string;
  operator: string;
  value?: string | number | boolean;
}
export interface ConditionGroup {
  op: "AND" | "OR" | "NOT";
  children: ConditionNode[];
}
export type ConditionNode = ConditionLeaf | ConditionGroup;

export interface ActionStep {
  type: string;
  params: Record<string, string>;
}

export interface RuleSummary {
  id: string;
  name: string;
  isEnabled: boolean;
  priority: number;
  triggerType: string;
  trigger: { type: string; scope?: { providerKey?: string }; params?: { hours?: number } };
  conditions: ConditionNode;
  actions: ActionStep[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuleInput {
  name: string;
  isEnabled: boolean;
  priority: number;
  trigger: { type: string; scope?: { providerKey?: string }; params?: { hours?: number } };
  conditions: ConditionNode;
  actions: ActionStep[];
}

export interface RuleExecutionLogItem {
  id: string;
  matchedAt: string;
  status: string;
  errorDetail: string | null;
  actionsExecuted: { type: string; status: string; output?: unknown; error?: string }[];
}

export async function fetchRules(accessToken: string): Promise<RuleSummary[]> {
  const res = await fetch(`${API_URL}/v1/rules`, { headers: authHeaders(accessToken) });
  return parseOrThrow<RuleSummary[]>(res);
}

export async function createRule(accessToken: string, input: RuleInput): Promise<RuleSummary> {
  const res = await fetch(`${API_URL}/v1/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify(input),
  });
  return parseOrThrow<RuleSummary>(res);
}

export async function updateRule(accessToken: string, ruleId: string, input: Partial<RuleInput>): Promise<RuleSummary> {
  const res = await fetch(`${API_URL}/v1/rules/${ruleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify(input),
  });
  return parseOrThrow<RuleSummary>(res);
}

export async function deleteRule(accessToken: string, ruleId: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/rules/${ruleId}`, { method: "DELETE", headers: authHeaders(accessToken) });
  await parseOrThrow(res);
}

export async function dryRunRule(
  accessToken: string,
  ruleId: string,
  sample: { bodyText: string; senderDisplayName: string; senderIsVip: boolean },
): Promise<{ matched: boolean; status?: string; actionsExecuted: { type: string; status: string; output?: unknown; error?: string }[] }> {
  const res = await fetch(`${API_URL}/v1/rules/${ruleId}/dry-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify(sample),
  });
  return parseOrThrow(res);
}

export async function fetchRuleExecutions(accessToken: string, ruleId: string): Promise<RuleExecutionLogItem[]> {
  const res = await fetch(`${API_URL}/v1/rules/${ruleId}/executions`, { headers: authHeaders(accessToken) });
  return parseOrThrow<RuleExecutionLogItem[]>(res);
}

export interface NotificationPreferences {
  silentHoursStart: string | null;
  silentHoursEnd: string | null;
  vipOverrideEnabled: boolean;
  keywordAlerts: string[];
}

export async function fetchNotificationPreferences(accessToken: string): Promise<NotificationPreferences> {
  const res = await fetch(`${API_URL}/v1/notification-preferences`, { headers: authHeaders(accessToken) });
  return parseOrThrow<NotificationPreferences>(res);
}

export async function updateNotificationPreferences(
  accessToken: string,
  input: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const res = await fetch(`${API_URL}/v1/notification-preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify(input),
  });
  return parseOrThrow<NotificationPreferences>(res);
}

export interface MessageSearchResult {
  id: string;
  conversationId: string;
  bodyText: string;
  receivedAt: string;
  senderDisplayName: string | null;
  conversationTitle: string | null;
}

export interface ContactSearchResult {
  id: string;
  displayName: string;
  isVip: boolean;
}

export interface SearchResults {
  messages: MessageSearchResult[];
  contacts: ContactSearchResult[];
}

export async function search(accessToken: string, query: string): Promise<SearchResults> {
  const res = await fetch(`${API_URL}/v1/search?q=${encodeURIComponent(query)}`, { headers: authHeaders(accessToken) });
  return parseOrThrow<SearchResults>(res);
}

export async function triggerMockMessage(
  accessToken: string,
  input: { senderDisplayName: string; senderExternalId: string; bodyText: string },
): Promise<void> {
  const res = await fetch(`${API_URL}/dev/mock-connector/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(accessToken) },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const problem = (await res.json()) as ProblemDetails;
    throw new Error(problem.detail ?? problem.title);
  }
}
