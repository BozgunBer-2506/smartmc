"use client";

import { useEffect, useState } from "react";
import { AuthForm } from "../components/AuthForm";
import { ConnectorManagement } from "../components/ConnectorManagement";
import { Inbox } from "../components/Inbox";
import { Rules } from "../components/Rules";
import { TeamManagement } from "../components/TeamManagement";
import {
  fetchMe,
  logout,
  setAuthListener,
  tryRefresh,
  type AuthResponse,
  type MeResponse,
  type PublicUser,
  type WorkspaceRole,
  type WorkspaceSessionResult,
} from "../lib/api";

/**
 * Orchestrates Phase 3's demo script (docs/ROADMAP.md Phase 3): shows the
 * login/register form until authenticated, then the real Inbox. On mount,
 * attempts a silent refresh from the httpOnly cookie alone - a page
 * reload doesn't force a fresh login if a valid session already exists,
 * matching real session semantics (docs/SECURITY.md Section 4.3).
 *
 * Phase 16.1 frontend integration: `applyAuth` is the one place
 * accessToken/user/workspaces/currentWorkspaceId ever change together -
 * boot, login, register, workspace switch, workspace creation, and
 * invite acceptance all funnel through it, so the rendered view can
 * never show data for a workspace the current token no longer
 * represents. Switching always lands back on Inbox, never a stale
 * Rules/Connectors/Team screen left over from the previous workspace.
 */
export default function HomePage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [workspaces, setWorkspaces] = useState<MeResponse["workspaces"]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<"inbox" | "rules" | "connectors" | "team">("inbox");

  async function applyAuth(token: string): Promise<void> {
    const me = await fetchMe(token);
    setAccessToken(token);
    setUser(me.user);
    setWorkspaces(me.workspaces);
    setCurrentWorkspaceId(me.currentWorkspaceId);
    setView("inbox");
  }

  useEffect(() => {
    tryRefresh().then(async (result) => {
      if (!result) {
        setBooting(false);
        return;
      }
      try {
        await applyAuth(result.accessToken);
      } finally {
        setBooting(false);
      }
    });
  }, []);

  function handleAuthenticated(result: AuthResponse) {
    applyAuth(result.accessToken);
  }

  function handleLoggedOut() {
    setAccessToken(null);
    setUser(null);
    setWorkspaces([]);
    setCurrentWorkspaceId(null);
    setView("inbox");
  }

  function handleWorkspaceChanged(result: WorkspaceSessionResult) {
    applyAuth(result.accessToken);
  }

  /** Leaving has no target workspace to switch into - the current session's own refresh token is now bound to a membership that no longer exists (correctly fails closed on its next refresh, per the prior security fix), so the only consistent move is a clean logout; a subsequent login resolves to whichever workspace the user still belongs to, same as it always has. */
  async function handleLeftWorkspace() {
    await logout();
    handleLoggedOut();
  }

  // Auth Reliability Hardening - lib/api.ts's central apiFetch wrapper
  // hands a refreshed token back here (so the next render uses it, not a
  // stale prop) and signals a clean logout when refresh itself fails,
  // instead of every component independently handling a 401.
  useEffect(() => {
    setAuthListener({ onRefreshed: setAccessToken, onExpired: handleLoggedOut });
    return () => setAuthListener(null);
  }, []);

  if (booting) {
    return (
      <main style={{ maxWidth: 420, margin: "80px auto", padding: 24, color: "#9AA5B1" }}>
        Loading...
      </main>
    );
  }

  if (!accessToken || !user || !currentWorkspaceId) {
    return <AuthForm onAuthenticated={handleAuthenticated} />;
  }

  const currentRole: WorkspaceRole = (workspaces.find((w) => w.workspaceId === currentWorkspaceId)?.role as WorkspaceRole) ?? "member";

  if (view === "rules") {
    return <Rules accessToken={accessToken} user={user} onBack={() => setView("inbox")} />;
  }

  if (view === "connectors") {
    return <ConnectorManagement accessToken={accessToken} user={user} onBack={() => setView("inbox")} />;
  }

  if (view === "team") {
    return (
      <TeamManagement
        accessToken={accessToken}
        user={user}
        currentRole={currentRole}
        onBack={() => setView("inbox")}
        onSwitched={handleWorkspaceChanged}
        onLeft={handleLeftWorkspace}
      />
    );
  }

  return (
    <Inbox
      accessToken={accessToken}
      user={user}
      workspaces={workspaces}
      currentWorkspaceId={currentWorkspaceId}
      currentRole={currentRole}
      onLoggedOut={handleLoggedOut}
      onOpenRules={() => setView("rules")}
      onOpenConnectors={() => setView("connectors")}
      onOpenTeam={() => setView("team")}
      onWorkspaceChanged={handleWorkspaceChanged}
    />
  );
}
