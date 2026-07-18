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
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    const problem = body as ProblemDetails;
    throw new Error(problem.detail ?? problem.title ?? `Request failed (${res.status})`);
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
  lastMessage: {
    id: string;
    bodyText: string;
    direction: string;
    receivedAt: string;
    sender: { id: string; displayName: string | null; isVip: boolean } | null;
  } | null;
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

export async function fetchConversations(accessToken: string): Promise<ConversationSummary[]> {
  const res = await fetch(`${API_URL}/v1/conversations`, { headers: authHeaders(accessToken) });
  return parseOrThrow<ConversationSummary[]>(res);
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
