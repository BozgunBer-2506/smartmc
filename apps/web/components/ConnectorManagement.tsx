"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Dialog, DialogContent, DialogDescription, DialogTitle, Input } from "@smc/ui";
import {
  connectDiscord,
  connectEmail,
  connectSlack,
  connectTelegram,
  disconnectConnector,
  fetchConnectors,
  type ConnectorSummary,
  type PublicUser,
} from "../lib/api";
import { PasswordInput } from "./PasswordInput";

interface ConnectorManagementProps {
  accessToken: string;
  user: PublicUser;
  onBack: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
  email: "Email",
};

/**
 * Health, derived from `LinkedAccount.status` (CONNECTOR_SDK.md Section 2's
 * lifecycle vocabulary) - no separate network call, since the status
 * column already carries this signal. `disconnected` never actually
 * appears here (a disconnected row is soft-deleted and excluded by
 * `GET /v1/connectors`), listed only for completeness.
 *
 * Migrated onto the design system's semantic status tokens (docs/ROADMAP.md
 * Phase 22.2) - previously hardcoded three hex values not shared with
 * anything else in the product (`#4CAF87`/`#E05858`/`#E0A458`), the last of
 * which was the exact same hex as the priority accent, a real violation of
 * docs/DESIGN_SYSTEM.md Section 4.1's "warning and priority must be
 * visually distinct hues" rule. `degraded` now uses `status-warning`
 * (never `accent-priority`), and `success`/`danger` use the same single
 * canonical token every other screen does.
 */
function healthFor(status: string): { label: string; className: string } {
  switch (status) {
    case "active":
      return { label: "Healthy", className: "text-status-success" };
    case "degraded":
      return { label: "Degraded", className: "text-status-warning" };
    case "reauth_required":
      return { label: "Needs reauthorization", className: "text-status-danger" };
    case "error":
      return { label: "Error", className: "text-status-danger" };
    case "registered":
    case "authenticating":
    case "syncing_initial":
      return { label: "Connecting…", className: "text-text-secondary" };
    case "disconnecting":
    case "disconnected":
      return { label: "Disconnected", className: "text-text-secondary" };
    default:
      return { label: status, className: "text-text-secondary" };
  }
}

/**
 * Connector Management (docs/ROADMAP.md Phase 21.2, closing a gap
 * `docs/UI_GUIDE.md` Section 20/24 specified from the start and
 * `docs/reviews/phase-4-sprint-2-review.md` explicitly deferred at Telegram's
 * own launch - "the raw data is already captured and available for whenever
 * that screen is built"). Lists every connected account with its real
 * status/health/last-sync/error (`GET /v1/connectors`, Phase 21.2's own
 * earlier addition), lets a user disconnect (with a confirmation step
 * naming what's retained, per `UI_GUIDE.md` Section 20) and connect a new
 * one - the connect forms themselves were already real (Phase 4-8), only
 * ever missing a home outside the main Inbox view and a way back off it.
 *
 * Migrated onto the design system (docs/ROADMAP.md Phase 22.2) - the
 * disconnect confirmation is now a real `Dialog` (previously an inline
 * conditional panel) since disconnecting is a genuinely destructive action;
 * Radix supplies focus trap/Escape/overlay-click-to-close for free. Same
 * confirmation copy and Cancel/Confirm behavior as before, only the
 * presentation changed.
 */
export function ConnectorManagement({ accessToken, onBack }: ConnectorManagementProps) {
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const [botToken, setBotToken] = useState("");
  const [connectingTelegram, setConnectingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);
  const [connectingDiscord, setConnectingDiscord] = useState(false);
  const [discordStatus, setDiscordStatus] = useState<string | null>(null);
  const [connectingSlack, setConnectingSlack] = useState(false);
  const [slackStatus, setSlackStatus] = useState<string | null>(null);
  const [imapHost, setImapHost] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [emailUsername, setEmailUsername] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [connectingEmail, setConnectingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  async function loadConnectors() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchConnectors(accessToken);
      setConnectors(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load connectors.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConnectors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDisconnect(connector: ConnectorSummary) {
    setDisconnectingId(connector.id);
    try {
      await disconnectConnector(accessToken, connector.provider, connector.id);
      setConfirmDisconnectId(null);
      await loadConnectors();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setDisconnectingId(null);
    }
  }

  async function handleConnectTelegram() {
    if (!botToken.trim()) return;
    setConnectingTelegram(true);
    setTelegramStatus(null);
    try {
      const result = await connectTelegram(accessToken, botToken.trim());
      setTelegramStatus(`Connected (status: ${result.status}, webhook: ${result.webhookRegistered ? "registered" : "reconciliation-only"})`);
      setBotToken("");
      await loadConnectors();
    } catch (err) {
      setTelegramStatus(err instanceof Error ? err.message : "Failed to connect Telegram bot.");
    } finally {
      setConnectingTelegram(false);
    }
  }

  async function handleConnectDiscord() {
    setConnectingDiscord(true);
    try {
      const { authorizationUrl } = await connectDiscord(accessToken);
      window.location.href = authorizationUrl; // full-page redirect - Discord's OAuth2 install flow, not an API call
    } catch (err) {
      setDiscordStatus(err instanceof Error ? err.message : "Failed to start the Discord connect flow.");
      setConnectingDiscord(false);
    }
  }

  async function handleConnectSlack() {
    setConnectingSlack(true);
    try {
      const { authorizationUrl } = await connectSlack(accessToken);
      window.location.href = authorizationUrl; // full-page redirect - Slack's OAuth v2 install flow, not an API call
    } catch (err) {
      setSlackStatus(err instanceof Error ? err.message : "Failed to start the Slack connect flow.");
      setConnectingSlack(false);
    }
  }

  async function handleConnectEmail() {
    if (!imapHost.trim() || !smtpHost.trim() || !emailUsername.trim() || !emailPassword.trim()) return;
    setConnectingEmail(true);
    setEmailStatus(null);
    try {
      const result = await connectEmail(accessToken, {
        imapHost: imapHost.trim(),
        imapPort: 993,
        imapSecure: true,
        smtpHost: smtpHost.trim(),
        smtpPort: 465,
        smtpSecure: true,
        username: emailUsername.trim(),
        password: emailPassword,
      });
      setEmailStatus(`Connected (status: ${result.status}, polling for new mail)`);
      setEmailPassword("");
      await loadConnectors();
    } catch (err) {
      setEmailStatus(err instanceof Error ? err.message : "Failed to connect the mailbox.");
    } finally {
      setConnectingEmail(false);
    }
  }

  const confirmingConnector = connectors.find((c) => c.id === confirmDisconnectId) ?? null;

  return (
    <main className="mx-auto max-w-[780px] p-6">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="m-0 text-xl text-text-primary">Connectors</h1>
        <Button onClick={onBack}>Back to Inbox</Button>
      </header>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-text-secondary">Connected accounts</h2>
        {loadError && (
          <Alert variant="danger" className="mb-2 flex items-center justify-between">
            <span>{loadError}</span>
            <Button onClick={loadConnectors}>Retry</Button>
          </Alert>
        )}
        {loading && <p className="text-[13px] text-text-secondary">Loading…</p>}
        {!loading && !loadError && connectors.length === 0 && (
          <p className="text-[13px] text-text-secondary">No connectors yet - connect one below.</p>
        )}
        {connectors.map((c) => {
          const health = healthFor(c.status);
          return (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    {PROVIDER_LABELS[c.provider] ?? c.provider}
                    {c.displayLabel && <span className="font-normal text-text-secondary"> - {c.displayLabel}</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-text-secondary">{c.externalAccountId}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                    <span className={`font-semibold ${health.className}`}>{health.label}</span>
                    <span className="text-text-secondary">Last synced: {c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString() : "never"}</span>
                  </div>
                  {c.lastError && <div className="mt-1.5 text-xs text-status-danger">{c.lastError}</div>}
                </div>
                <Button onClick={() => setConfirmDisconnectId(c.id)}>Disconnect</Button>
              </div>
            </Card>
          );
        })}
      </section>

      <Dialog open={confirmDisconnectId !== null} onOpenChange={(open) => !open && setConfirmDisconnectId(null)}>
        <DialogContent>
          <DialogTitle>Disconnect {confirmingConnector ? (PROVIDER_LABELS[confirmingConnector.provider] ?? confirmingConnector.provider) : ""}?</DialogTitle>
          <DialogDescription>Message history from this connection is kept - only new messages stop arriving.</DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setConfirmDisconnectId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => confirmingConnector && handleDisconnect(confirmingConnector)}
              disabled={disconnectingId === confirmDisconnectId}
            >
              {disconnectingId === confirmDisconnectId ? "Disconnecting…" : "Confirm disconnect"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <section className="mb-5 rounded-lg border border-border-subtle p-4">
        <h2 className="mb-2 text-sm font-semibold text-text-secondary">Connect a channel</h2>

        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          <Input
            className="flex-[1_1_240px]"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="Telegram bot token (from @BotFather)"
          />
          <Button onClick={handleConnectTelegram} disabled={connectingTelegram}>
            {connectingTelegram ? "Connecting..." : "Connect Telegram"}
          </Button>
          {telegramStatus && <span className="text-xs text-text-secondary">{telegramStatus}</span>}
        </div>

        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          <Button onClick={handleConnectDiscord} disabled={connectingDiscord}>
            {connectingDiscord ? "Redirecting..." : "Connect Discord"}
          </Button>
          <Button onClick={handleConnectSlack} disabled={connectingSlack}>
            {connectingSlack ? "Redirecting..." : "Connect Slack"}
          </Button>
          {discordStatus && <span className="text-xs text-text-secondary">{discordStatus}</span>}
          {slackStatus && <span className="text-xs text-text-secondary">{slackStatus}</span>}
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <Input className="flex-[1_1_190px]" value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="IMAP host (imap.gmail.com)" />
          <Input className="flex-[1_1_190px]" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="SMTP host (smtp.gmail.com)" />
          <Input className="flex-[1_1_190px]" value={emailUsername} onChange={(e) => setEmailUsername(e.target.value)} placeholder="Email address" />
          <PasswordInput
            value={emailPassword}
            onChange={setEmailPassword}
            placeholder="App password"
            containerStyle={{ flex: "1 1 160px" }}
            hint="Gmail/Outlook require an app-specific password, not your account password."
          />
          <Button onClick={handleConnectEmail} disabled={connectingEmail}>
            {connectingEmail ? "Connecting..." : "Connect Email"}
          </Button>
          {emailStatus && <span className="text-xs text-text-secondary">{emailStatus}</span>}
        </div>
      </section>
    </main>
  );
}
