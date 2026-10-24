"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@smc/ui";
import {
  acceptWorkspaceInvite,
  changeWorkspaceMemberRole,
  fetchWorkspaceMembers,
  inviteWorkspaceMember,
  leaveWorkspace,
  removeWorkspaceMember,
  transferWorkspaceOwnership,
  type PublicUser,
  type WorkspaceMemberSummary,
  type WorkspaceRole,
  type WorkspaceSessionResult,
} from "../lib/api";

interface TeamManagementProps {
  accessToken: string;
  user: PublicUser;
  currentRole: WorkspaceRole;
  onBack: () => void;
  /** Leaving or accepting an invite moves the caller to a DIFFERENT workspace - same "fresh session" shape switching a workspace already produces. */
  onSwitched: (result: WorkspaceSessionResult) => void;
  /** Leaving has no target workspace to switch into - the caller falls back to whichever workspace `tryRefresh()` resolves next, same as a normal page reload. */
  onLeft: () => void;
}

const ROLE_BADGE_VARIANT: Record<WorkspaceRole, "priority" | "neutral"> = {
  owner: "priority",
  admin: "neutral",
  member: "neutral",
};

/**
 * Phase 16.1 frontend integration - the one Business-only screen
 * (docs/architecture/personal-business-split.md Section 3). Reachable
 * whenever the caller can act on membership at all (owner/admin, who
 * need it to ever invite a first teammate) or the workspace already has
 * more than one member - gated by role/headcount in Inbox.tsx, never by
 * a separate "account type" flag.
 */
export function TeamManagement({ accessToken, user, currentRole, onBack, onSwitched, onLeft }: TeamManagementProps) {
  const [members, setMembers] = useState<WorkspaceMemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ code: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [acceptCode, setAcceptCode] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actingMemberId, setActingMemberId] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  const canManage = currentRole === "owner" || currentRole === "admin";

  async function loadMembers() {
    setLoading(true);
    setLoadError(null);
    try {
      setMembers(await fetchWorkspaceMembers(accessToken));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load team members.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleInvite() {
    setInviting(true);
    setInviteError(null);
    try {
      const result = await inviteWorkspaceMember(accessToken, { email: inviteEmail.trim() || undefined, role: inviteRole });
      setInviteResult({ code: result.code });
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to create invite.");
    } finally {
      setInviting(false);
    }
  }

  function closeInviteDialog() {
    setShowInviteDialog(false);
    setInviteEmail("");
    setInviteRole("member");
    setInviteResult(null);
    setInviteError(null);
  }

  async function handleAcceptInvite() {
    if (!acceptCode.trim()) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const result = await acceptWorkspaceInvite(accessToken, acceptCode.trim());
      onSwitched(result);
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : "Failed to accept invite.");
    } finally {
      setAccepting(false);
    }
  }

  async function handleRoleChange(memberId: string, role: "admin" | "member") {
    setActingMemberId(memberId);
    setActionError(null);
    try {
      await changeWorkspaceMemberRole(accessToken, memberId, role);
      await loadMembers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to change role.");
    } finally {
      setActingMemberId(null);
    }
  }

  async function handleRemove(memberId: string) {
    setActingMemberId(memberId);
    setActionError(null);
    try {
      await removeWorkspaceMember(accessToken, memberId);
      await loadMembers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove member.");
    } finally {
      setActingMemberId(null);
    }
  }

  async function handleLeave() {
    setActionError(null);
    try {
      await leaveWorkspace(accessToken);
      setConfirmLeave(false);
      onLeft();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to leave workspace.");
      setConfirmLeave(false);
    }
  }

  async function handleTransfer() {
    if (!transferTargetId) return;
    setTransferring(true);
    setActionError(null);
    try {
      await transferWorkspaceOwnership(accessToken, transferTargetId);
      setTransferTargetId(null);
      await loadMembers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to transfer ownership.");
    } finally {
      setTransferring(false);
    }
  }

  const transferCandidates = members.filter((m) => m.userId !== user.id && m.role !== "owner");

  return (
    <main className="mx-auto max-w-[780px] p-6">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="m-0 text-xl text-text-primary">Team</h1>
        <Button onClick={onBack}>Back to Inbox</Button>
      </header>

      {actionError && (
        <Alert variant="danger" className="mb-4">
          {actionError}
        </Alert>
      )}

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary">Members</h2>
          {canManage && <Button onClick={() => setShowInviteDialog(true)}>Invite member</Button>}
        </div>

        {loadError && (
          <Alert variant="danger" className="mb-2 flex items-center justify-between">
            <span>{loadError}</span>
            <Button onClick={loadMembers}>Retry</Button>
          </Alert>
        )}
        {loading && <p className="text-[13px] text-text-secondary">Loading…</p>}

        {!loading &&
          !loadError &&
          members.map((m) => {
            const isSelf = m.userId === user.id;
            const adminBlockedByOtherAdmin = currentRole === "admin" && m.role !== "member";
            const canActOnThisRow = canManage && !isSelf && m.role !== "owner" && !adminBlockedByOtherAdmin;
            return (
              <Card key={m.id} className="mb-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-text-primary">
                      {m.displayName ?? m.email}
                      {isSelf && <span className="font-normal text-text-secondary"> (you)</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-text-secondary">{m.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={ROLE_BADGE_VARIANT[m.role]}>{m.role}</Badge>
                    {canActOnThisRow && (
                      <>
                        <Select
                          value={m.role}
                          onValueChange={(role) => handleRoleChange(m.id, role as "admin" | "member")}
                        >
                          <SelectTrigger className="w-[110px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">admin</SelectItem>
                            <SelectItem value="member">member</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="destructive"
                          onClick={() => handleRemove(m.id)}
                          disabled={actingMemberId === m.id}
                        >
                          Remove
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-text-secondary">Join another workspace</h2>
        <Card>
          <div className="flex items-center gap-2">
            <Input
              className="flex-1"
              placeholder="Paste an invite code"
              value={acceptCode}
              onChange={(e) => setAcceptCode(e.target.value)}
            />
            <Button onClick={handleAcceptInvite} disabled={accepting || !acceptCode.trim()}>
              {accepting ? "Joining…" : "Join"}
            </Button>
          </div>
          {acceptError && <p className="mt-2 text-xs text-status-danger">{acceptError}</p>}
        </Card>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-secondary">This workspace</h2>
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            {currentRole === "owner" && members.length > 1 && (
              <Button onClick={() => setTransferTargetId(transferCandidates[0]?.userId ?? null)}>Transfer ownership</Button>
            )}
            <Button variant="destructive" onClick={() => setConfirmLeave(true)}>
              Leave workspace
            </Button>
          </div>
        </Card>
      </section>

      {/* Invite dialog */}
      <Dialog open={showInviteDialog} onOpenChange={(open) => !open && closeInviteDialog()}>
        <DialogContent>
          <DialogTitle>Invite a teammate</DialogTitle>
          {!inviteResult ? (
            <>
              <DialogDescription>Leave the email blank to create a code anyone can redeem.</DialogDescription>
              <Input className="mt-3" placeholder="Email (optional)" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "admin" | "member")}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
              {inviteError && <p className="mt-2 text-xs text-status-danger">{inviteError}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <Button onClick={closeInviteDialog}>Cancel</Button>
                <Button onClick={handleInvite} disabled={inviting}>
                  {inviting ? "Creating…" : "Create invite"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogDescription>
                Share this code - it&apos;s shown once and can&apos;t be retrieved again.
              </DialogDescription>
              <Input className="mt-3" readOnly value={inviteResult.code} onFocus={(e) => e.currentTarget.select()} />
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={async () => {
                    closeInviteDialog();
                    await loadMembers();
                  }}
                >
                  Done
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Leave confirmation */}
      <Dialog open={confirmLeave} onOpenChange={(open) => !open && setConfirmLeave(false)}>
        <DialogContent>
          <DialogTitle>Leave this workspace?</DialogTitle>
          <DialogDescription>
            {currentRole === "owner"
              ? "As owner, you may need to transfer ownership first if other members remain - the server will tell you if so."
              : "You'll lose access to this workspace's conversations and automations."}
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setConfirmLeave(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleLeave}>
              Confirm leave
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer ownership */}
      <Dialog open={transferTargetId !== null} onOpenChange={(open) => !open && setTransferTargetId(null)}>
        <DialogContent>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>You&apos;ll become an admin; the selected member becomes the new owner. This cannot be undone by anyone but the new owner.</DialogDescription>
          {transferCandidates.length > 0 ? (
            <Select value={transferTargetId ?? undefined} onValueChange={setTransferTargetId}>
              <SelectTrigger className="mt-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {transferCandidates.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.displayName ?? m.email} ({m.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="mt-3 text-xs text-text-secondary">No other members to transfer to.</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setTransferTargetId(null)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={transferring || !transferTargetId}>
              {transferring ? "Transferring…" : "Confirm transfer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
