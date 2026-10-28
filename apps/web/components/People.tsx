"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, ProviderBadge, Skeleton } from "@smc/ui";
import {
  approveMergeSuggestion,
  fetchContacts,
  fetchMergeSuggestions,
  rejectMergeSuggestion,
  setContactVip,
  splitContact,
  type Contact,
  type MergeSuggestion,
  type PublicUser,
} from "../lib/api";

interface PeopleProps {
  accessToken: string;
  user: PublicUser;
}

const smallButtonClass =
  "rounded-sm border border-border-subtle bg-surface-2 px-2 py-1 text-[11px] text-text-primary hover:border-border-strong";

/**
 * People (Phase 16.3) - the real Contact/Identity surface
 * (docs/ARCHITECTURE.md Section 13.6), styled after the marketing Light V3
 * identity chapter but backed entirely by GET /v1/contacts and the
 * existing merge-suggestion endpoints Inbox.tsx already uses. Every
 * action here is a real, awaited API call followed by a refetch of the
 * affected list - never an optimistic local update - so the UI can never
 * show a state the server hasn't actually confirmed.
 *
 * Person-timeline (a unified per-contact message history) is explicitly
 * out of scope for this phase - identities are shown as a flat list, not
 * resolved into a combined conversation view.
 */
export function People({ accessToken, user }: PeopleProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const [splitSelection, setSplitSelection] = useState<Set<string>>(new Set());
  const [splitting, setSplitting] = useState(false);

  async function loadContacts() {
    setContactsLoading(true);
    setContactsError(null);
    try {
      setContacts(await fetchContacts(accessToken));
    } catch (err) {
      setContactsError(err instanceof Error ? err.message : "Failed to load people.");
    } finally {
      setContactsLoading(false);
    }
  }

  async function loadSuggestions() {
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      setMergeSuggestions(await fetchMergeSuggestions(accessToken));
    } catch (err) {
      setSuggestionsError(err instanceof Error ? err.message : "Failed to load merge suggestions.");
    } finally {
      setSuggestionsLoading(false);
    }
  }

  useEffect(() => {
    loadContacts();
    loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  async function handleToggleVip(contact: Contact) {
    setActingId(contact.id);
    setActionError(null);
    try {
      await setContactVip(accessToken, contact.id, !contact.isVip);
      // Real server confirmation drives the UI, not an optimistic flip -
      // refetch rather than locally mutating the toggled contact.
      await loadContacts();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update VIP status.");
    } finally {
      setActingId(null);
    }
  }

  function toggleSplitSelection(identityId: string) {
    setSplitSelection((prev) => {
      const next = new Set(prev);
      if (next.has(identityId)) next.delete(identityId);
      else next.add(identityId);
      return next;
    });
  }

  async function handleSplit() {
    if (!selected || splitSelection.size === 0) return;
    setSplitting(true);
    setActionError(null);
    try {
      await splitContact(accessToken, selected.id, [...splitSelection], "Manual split from People screen");
      setSplitSelection(new Set());
      setSelectedId(null);
      await loadContacts();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to split contact.");
    } finally {
      setSplitting(false);
    }
  }

  async function handleApproveSuggestion(id: string) {
    setActingId(id);
    setActionError(null);
    try {
      await approveMergeSuggestion(accessToken, id);
      await Promise.all([loadSuggestions(), loadContacts()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve merge.");
    } finally {
      setActingId(null);
    }
  }

  async function handleRejectSuggestion(id: string) {
    setActingId(id);
    setActionError(null);
    try {
      await rejectMergeSuggestion(accessToken, id);
      await loadSuggestions();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reject merge.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <main className="w-full max-w-[1320px] p-5 sm:p-7 lg:p-9">
      <header className="mb-5">
        <h1 className="m-0 text-[clamp(1.5rem,2.6vw,1.875rem)] font-semibold leading-tight tracking-tight text-text-primary">People</h1>
        <p className="mt-1.5 text-[13px] text-text-secondary">
          {user.displayName ?? user.email}&apos;s connected contacts, across every channel.
        </p>
      </header>

      {actionError && (
        <Card className="mb-4 border-status-danger text-[13px] text-status-danger">{actionError}</Card>
      )}

      {!suggestionsLoading && !suggestionsError && mergeSuggestions.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">Possible duplicate contacts</h2>
          {mergeSuggestions.map((s) => (
            <Card key={s.id} className="mb-2 border-l-[3px] border-l-accent-priority">
              <p className="m-0 text-[13px]">
                <strong>{s.contactA?.displayName ?? "Unknown"}</strong> and <strong>{s.contactB?.displayName ?? "Unknown"}</strong> might
                be the same person ({Math.round(s.confidenceScore * 100)}% confidence - {s.matchingSignals.reason})
              </p>
              <div className="mt-2 flex gap-2">
                <Button onClick={() => handleApproveSuggestion(s.id)} disabled={actingId === s.id}>
                  Merge
                </Button>
                <Button onClick={() => handleRejectSuggestion(s.id)} disabled={actingId === s.id}>
                  Not the same person
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}
      {suggestionsError && (
        <Card className="mb-4 border-status-danger text-[13px] text-status-danger">
          Could not load merge suggestions: {suggestionsError}{" "}
          <button onClick={loadSuggestions} className={`${smallButtonClass} ml-1.5`}>
            Retry
          </button>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[340px_1fr] md:items-start">
        <section
          className={[
            selectedId ? "hidden md:block" : "block",
            "overflow-hidden rounded-lg border border-border-subtle bg-surface-1 shadow-sm",
          ].join(" ")}
        >
          <div className="border-b border-border-subtle px-4 py-3.5">
            <h2 className="m-0 text-sm font-semibold text-text-primary">Contacts</h2>
          </div>
          <div className="max-h-[calc(100vh-20rem)] overflow-y-auto p-2">
            {contactsError && (
              <Card className="mb-2 border-status-danger text-[13px] text-status-danger">
                Could not load people: {contactsError}{" "}
                <button onClick={loadContacts} className={`${smallButtonClass} ml-1.5`}>
                  Retry
                </button>
              </Card>
            )}
            {contactsLoading && (
              <div className="space-y-2">
                <Skeleton className="h-[58px]" />
                <Skeleton className="h-[58px]" />
                <Skeleton className="h-[58px]" />
              </div>
            )}
            {!contactsLoading && !contactsError && contacts.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-lg" aria-hidden>
                  👤
                </span>
                <strong className="text-sm text-text-primary">No people yet</strong>
                <p className="max-w-[220px] text-[13px] text-text-secondary">
                  Contacts appear here automatically once messages start arriving from your connected accounts.
                </p>
              </div>
            )}
            {!contactsLoading &&
              contacts.map((c) => {
                const name = c.displayName ?? "Unknown";
                const initial = name.trim().charAt(0).toUpperCase() || "?";
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedId(c.id);
                      setSplitSelection(new Set());
                    }}
                    className={[
                      "group mb-1 cursor-pointer rounded-md px-2.5 py-2.5 transition-colors hover:bg-surface-2",
                      selectedId === c.id ? "bg-brand-soft" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-text-primary text-[13px] font-semibold text-background-base"
                        aria-hidden
                      >
                        {initial}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="min-w-0 truncate text-[13.5px] font-medium text-text-primary">{name}</span>
                          {c.isVip && <Badge variant="priority">VIP</Badge>}
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-text-secondary">
                          {c.identities.length} connected {c.identities.length === 1 ? "identity" : "identities"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>

        <section
          className={[
            selectedId ? "block" : "hidden md:block",
            "flex min-h-[calc(100vh-18rem)] flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface-1 shadow-sm",
          ].join(" ")}
        >
          <div className="border-b border-border-subtle px-4 py-3.5">
            <button type="button" onClick={() => setSelectedId(null)} className={`${smallButtonClass} mb-2 inline-block md:hidden`}>
              ← Back to people
            </button>
            <h2 className="m-0 text-sm font-semibold text-text-primary">Details</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {!selected && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-lg" aria-hidden>
                  👤
                </span>
                <p className="text-[13px] text-text-secondary">Select a person to see their connected identities.</p>
              </div>
            )}
            {selected && (
              <>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-text-primary text-sm font-semibold text-background-base"
                      aria-hidden
                    >
                      {(selected.displayName ?? "Unknown").trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <div>
                      <p className="m-0 text-base font-semibold text-text-primary">{selected.displayName ?? "Unknown"}</p>
                      {selected.isVip && <Badge variant="priority">VIP</Badge>}
                    </div>
                  </div>
                  <Button onClick={() => handleToggleVip(selected)} disabled={actingId === selected.id}>
                    {actingId === selected.id ? "Updating…" : selected.isVip ? "Remove VIP" : "Mark as VIP"}
                  </Button>
                </div>

                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Connected identities</h3>
                <div className="space-y-2">
                  {selected.identities.map((identity) => (
                    <Card key={identity.id} className="flex items-center justify-between gap-2">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={splitSelection.has(identity.id)}
                          onChange={() => toggleSplitSelection(identity.id)}
                          disabled={selected.identities.length <= 1}
                        />
                        <ProviderBadge providerKey={identity.providerKey} />
                        <span className="min-w-0 truncate text-[13px] text-text-primary">{identity.handle}</span>
                      </label>
                      <span className="flex-shrink-0 text-[11px] text-text-disabled">{identity.matchType}</span>
                    </Card>
                  ))}
                </div>

                {selected.identities.length > 1 && (
                  <div className="mt-4 border-t border-border-subtle pt-4">
                    <p className="mb-2 text-[12px] text-text-secondary">
                      If some of these identities don&apos;t actually belong to the same person, select them above and split
                      them into a new contact.
                    </p>
                    <Button onClick={handleSplit} disabled={splitting || splitSelection.size === 0}>
                      {splitting ? "Splitting…" : `Split ${splitSelection.size || ""} selected into new contact`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
