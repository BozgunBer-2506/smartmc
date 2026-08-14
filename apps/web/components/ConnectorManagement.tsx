"use client";

import { useEffect, useState } from "react";
import { Button } from "@smc/ui";
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
 */
function healthFor(status: string): { label: string; color: string } {
  switch (status) {
    case "active":
      return { label: "Healthy", color: "#4CAF87" };
    case "degraded":
      return { label: "Degraded", color: "#E0A458" };
    case "reauth_required":
      return { label: "Needs reauthorization", color: "#E05858" };
    case "error":
      return { label: "Error", color: "#E05858" };
    case "registered":
    case "authenticating":
    case "syncing_initial":
      return { label: "Connecting…", color: "#9AA5B1" };
    case "disconnecting":
    case "disconnected":
      return { label: "Disconnected", color: "#9AA5B1" };
    default:
      return { label: status, color: "#9AA5B1" };
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

  return (
    <main style={{ maxWidth: 780, margin: "0 auto", padding: 24 }}>
      <style>{`
        @media (max-width: 720px) {
          .connector-row { flex-direction: column; align-items: stretch !important; }
        }
      `}</style>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Connectors</h1>
        <Button onClick={onBack}>Back to Inbox</Button>
      </header>

      <section style={{ margin: "0 0 24px" }}>
        <h2 style={sectionHeading}>Connected accounts</h2>
        {loadError && (
          <div style={{ ...cardStyle, borderColor: "#E05858", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>{loadError}</span>
            <Button onClick={loadConnectors}>Retry</Button>
          </div>
        )}
        {loading && <p style={{ fontSize: 13, color: "#9AA5B1" }}>Loading…</p>}
        {!loading && !loadError && connectors.length === 0 && (
          <p style={{ fontSize: 13, color: "#9AA5B1" }}>No connectors yet - connect one below.</p>
        )}
        {connectors.map((c) => {
          const health = healthFor(c.status);
          return (
            <article key={c.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {PROVIDER_LABELS[c.provider] ?? c.provider}
                    {c.displayLabel && <span style={{ color: "#9AA5B1", fontWeight: 400 }}> - {c.displayLabel}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#9AA5B1", marginTop: 2 }}>{c.externalAccountId}</div>
                  <div style={{ fontSize: 12, marginTop: 6, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: health.color, fontWeight: 600 }}>{health.label}</span>
                    <span style={{ color: "#9AA5B1" }}>
                      Last synced: {c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString() : "never"}
                    </span>
                  </div>
                  {c.lastError && (
                    <div style={{ fontSize: 12, color: "#E05858", marginTop: 6 }}>{c.lastError}</div>
                  )}
                </div>
                {confirmDisconnectId === c.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flex: "0 0 220px" }}>
                    <p style={{ fontSize: 12, color: "#9AA5B1", margin: 0, textAlign: "right" }}>
                      Message history from this connection is kept - only new messages stop arriving.
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button onClick={() => setConfirmDisconnectId(null)}>Cancel</Button>
                      <Button onClick={() => handleDisconnect(c)} disabled={disconnectingId === c.id}>
                        {disconnectingId === c.id ? "Disconnecting…" : "Confirm disconnect"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={() => setConfirmDisconnectId(c.id)}>Disconnect</Button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section style={{ margin: "0 0 20px", border: "1px solid #2A3441", borderRadius: 8, padding: 16 }}>
        <h2 style={sectionHeading}>Connect a channel</h2>

        <div className="connector-row" style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="Telegram bot token (from @BotFather)"
            style={inputStyle({ flex: "1 1 240px" })}
          />
          <Button onClick={handleConnectTelegram} disabled={connectingTelegram}>
            {connectingTelegram ? "Connecting..." : "Connect Telegram"}
          </Button>
          {telegramStatus && <span style={{ fontSize: 12, color: "#9AA5B1" }}>{telegramStatus}</span>}
        </div>

        <div className="connector-row" style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
          <Button onClick={handleConnectDiscord} disabled={connectingDiscord}>
            {connectingDiscord ? "Redirecting..." : "Connect Discord"}
          </Button>
          <Button onClick={handleConnectSlack} disabled={connectingSlack}>
            {connectingSlack ? "Redirecting..." : "Connect Slack"}
          </Button>
          {discordStatus && <span style={{ fontSize: 12, color: "#9AA5B1" }}>{discordStatus}</span>}
          {slackStatus && <span style={{ fontSize: 12, color: "#9AA5B1" }}>{slackStatus}</span>}
        </div>

        <div className="connector-row" style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="IMAP host (imap.gmail.com)" style={inputStyle({ flex: "1 1 190px" })} />
          <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="SMTP host (smtp.gmail.com)" style={inputStyle({ flex: "1 1 190px" })} />
          <input value={emailUsername} onChange={(e) => setEmailUsername(e.target.value)} placeholder="Email address" style={inputStyle({ flex: "1 1 190px" })} />
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
          {emailStatus && <span style={{ fontSize: 12, color: "#9AA5B1" }}>{emailStatus}</span>}
        </div>
      </section>
    </main>
  );
}

function inputStyle(extra: Record<string, string | number>): Record<string, string | number> {
  return { padding: 8, borderRadius: 6, border: "1px solid #2A3441", background: "#111726", color: "#F5F7FA", ...extra };
}

const sectionHeading: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: "#9AA5B1", margin: "0 0 8px" };

const cardStyle: React.CSSProperties = {
  border: "1px solid #2A3441",
  borderRadius: 8,
  padding: 12,
  marginBottom: 8,
  background: "#111726",
};
