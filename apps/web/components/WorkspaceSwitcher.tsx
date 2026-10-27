"use client";

import { useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@smc/ui";
import { createWorkspace, switchWorkspace, type MeResponse, type WorkspaceSessionResult } from "../lib/api";

interface WorkspaceSwitcherProps {
  accessToken: string;
  currentWorkspaceId: string;
  workspaces: MeResponse["workspaces"];
  onSwitched: (result: WorkspaceSessionResult) => void;
}

/**
 * Phase 16.1 frontend integration (docs/architecture/personal-business-split.md
 * Section 3). Deliberately minimal with only one workspace - Personal
 * stays simple, no dropdown chrome for a single option - just the one
 * "+ Business workspace" entry point every account needs to ever start
 * one. The real switcher (the existing `Select` primitive, not a new
 * dropdown component) only appears once there's actually something to
 * switch between.
 */
export function WorkspaceSwitcher({ accessToken, currentWorkspaceId, workspaces, onSwitched }: WorkspaceSwitcherProps) {
  const [switching, setSwitching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  async function handleSwitch(workspaceId: string) {
    if (workspaceId === currentWorkspaceId) return;
    setSwitching(true);
    setError(null);
    try {
      onSwitched(await switchWorkspace(accessToken, workspaceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch workspace.");
    } finally {
      setSwitching(false);
    }
  }

  async function handleCreate() {
    if (!newWorkspaceName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createWorkspace(accessToken, newWorkspaceName.trim());
      setShowCreateDialog(false);
      setNewWorkspaceName("");
      onSwitched(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace.");
    } finally {
      setCreating(false);
    }
  }

  const current = workspaces.find((w) => w.workspaceId === currentWorkspaceId);

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:flex-col lg:items-stretch">
      {workspaces.length > 1 ? (
        <Select value={currentWorkspaceId} onValueChange={handleSwitch} disabled={switching}>
          <SelectTrigger className="w-full min-w-0 sm:w-[180px] lg:w-full [&>span]:truncate" aria-label="Switch workspace">
            <SelectValue placeholder={current?.workspaceName ?? "Workspace"} />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((w) => (
              <SelectItem key={w.workspaceId} value={w.workspaceId}>
                {w.workspaceName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        current && <span className="break-words text-[13px] text-text-secondary">{current.workspaceName}</span>
      )}

      <Button onClick={() => setShowCreateDialog(true)} disabled={switching}>
        + Business workspace
      </Button>
      {error && <span className="text-xs text-status-danger">{error}</span>}

      <Dialog open={showCreateDialog} onOpenChange={(open) => !open && setShowCreateDialog(false)}>
        <DialogContent>
          <DialogTitle>Create a Business workspace</DialogTitle>
          <DialogDescription>
            A new, empty workspace separate from your current one - invite teammates into it once it&apos;s created. Your
            existing workspace and its data are never affected.
          </DialogDescription>
          <Input
            className="mt-3"
            placeholder="Workspace name"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            autoFocus
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newWorkspaceName.trim()}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
