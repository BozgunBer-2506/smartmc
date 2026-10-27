"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { Alert, Button, ThemeToggle } from "@smc/ui";
import { logout, type MeResponse, type PublicUser, type WorkspaceRole, type WorkspaceSessionResult } from "../lib/api";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export type AppView = "inbox" | "connectors" | "rules" | "team";

interface PersonalAppShellProps {
  accessToken: string;
  user: PublicUser;
  workspaces: MeResponse["workspaces"];
  currentWorkspaceId: string;
  currentRole: WorkspaceRole;
  view: AppView;
  onViewChange: (view: AppView) => void;
  onWorkspaceChanged: (result: WorkspaceSessionResult) => void;
  onLoggedOut: () => void;
  children: ReactNode;
}

const NAV_ITEMS: Array<{ view: AppView; label: string }> = [
  { view: "inbox", label: "Inbox" },
  { view: "connectors", label: "Connectors" },
  { view: "rules", label: "Automations" },
  { view: "team", label: "Team" },
];

/** Shared presentation for the existing workspace screens. Personal is
 * the starting experience, not a new workspace type or permission model. */
export function PersonalAppShell({
  accessToken, user, workspaces, currentWorkspaceId, currentRole, view,
  onViewChange, onWorkspaceChanged, onLoggedOut, children,
}: PersonalAppShellProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  // Preserve the existing Inbox entry-point rule for Business workspaces.
  const showTeam = currentRole === "owner" || currentRole === "admin" || workspaces.length > 1;

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
      onLoggedOut();
    } catch (err) {
      setLogoutError(err instanceof Error ? err.message : "Could not log out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-background-base text-text-primary lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#workspace-content"
        className="sr-only z-50 rounded-md bg-surface-1 p-3 text-text-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <aside className="flex min-w-0 flex-col gap-5 border-b border-border-subtle bg-surface-1 p-4 sm:p-5 lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onViewChange("inbox")}
            aria-label="Looktra inbox"
            className="flex items-center gap-2.5 rounded-md text-xl font-semibold tracking-tight"
          >
            <Image src="/looktra-symbol.png" alt="" width={32} height={16} />
            Looktra
          </button>
          <ThemeToggle />
        </div>

        <div className="min-w-0">
          <p className="mb-2 text-xs font-medium text-text-secondary">Workspace</p>
          <WorkspaceSwitcher
            accessToken={accessToken}
            currentWorkspaceId={currentWorkspaceId}
            workspaces={workspaces}
            onSwitched={onWorkspaceChanged}
          />
        </div>

        <nav aria-label="Workspace" className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {NAV_ITEMS.filter((item) => item.view !== "team" || showTeam).map((item) => (
            <Button
              key={item.view}
              type="button"
              variant="ghost"
              aria-current={view === item.view ? "page" : undefined}
              onClick={() => onViewChange(item.view)}
              className={
                "h-11 shrink-0 justify-start px-3 " +
                (view === item.view ? "bg-brand-soft text-brand-primary hover:bg-brand-soft hover:text-brand-primary" : "")
              }
            >
              {item.label}
            </Button>
          ))}
        </nav>

        <div className="flex min-w-0 items-center justify-between gap-3 border-t border-border-subtle pt-4 lg:mt-auto lg:flex-col lg:items-stretch">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{user.displayName ?? user.email}</p>
            <p className="truncate text-xs text-text-secondary">{user.email}</p>
          </div>
          <Button variant="outline" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? "Logging out…" : "Log out"}
          </Button>
        </div>
        {logoutError && <Alert variant="danger">{logoutError}</Alert>}
      </aside>

      <div id="workspace-content" tabIndex={-1} className="min-w-0">
        {children}
      </div>
    </div>
  );
}
