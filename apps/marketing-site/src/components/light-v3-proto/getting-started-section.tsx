import { Check } from "lucide-react";
import { ChannelTile } from "./connector";

const CONNECT_PLATFORMS = ["Telegram", "Discord", "Slack", "Email"];

const STEPS = [
  {
    n: "01",
    status: "done" as const,
    title: "Create your workspace",
    body: "Sign up and your personal workspace is ready.",
  },
  {
    n: "02",
    status: "active" as const,
    title: "Connect a service",
    body: "Choose Telegram, Discord, Slack or email and follow the connection steps.",
  },
  {
    n: "03",
    status: "next" as const,
    title: "See conversations arrive",
    body: "Your connected services bring supported conversations into one inbox.",
  },
];

/**
 * Chapter 5: closing "Getting Started" chapter. Visually distinct from the
 * prior four — centered editorial header, then one full-width setup
 * surface with a real step-progress pattern (done / active / next), not
 * three separate SaaS feature cards. Grounded in the actual product: step
 * 01 reflects that registration auto-creates the workspace (no wizard),
 * step 02 reflects the real ConnectorManagement connect flow, step 03
 * reflects the real empty-inbox → populated-inbox transition.
 */
export function LightV3GettingStarted() {
  return (
    <section id="getting-started" className="relative">
      <div className="mx-auto max-w-[900px] px-6 pb-24 pt-6 text-center sm:pb-28 lg:px-10 lg:pb-32">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--v3-orange)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--v3-orange)]" aria-hidden />
          Getting started
        </p>
        <h2 className="mx-auto mt-4 max-w-[18ch] font-display text-[clamp(2.25rem,4.4vw,3.25rem)] font-semibold leading-[1.08] tracking-tight text-[var(--v3-ink)]">
          Your messages, together.
          <br />
          <span className="text-[var(--v3-orange)]">
            Getting started
            <br />
            is simple.
          </span>
        </h2>

        {/* One setup surface, full width, real step-progress pattern. */}
        <div className="mx-auto mt-12 max-w-[760px] overflow-hidden rounded-2xl border border-[var(--v3-line)] bg-[var(--v3-surface)] text-left shadow-[0_30px_70px_-32px_rgba(12,11,10,0.22)]">
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              className={
                "flex gap-5 px-7 py-6 sm:px-9" +
                (i > 0 ? " border-t border-[var(--v3-line)]" : "") +
                (step.status === "active" ? " bg-[var(--v3-orange-wash)]" : "")
              }
            >
              <span
                className={
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold " +
                  (step.status === "done"
                    ? "bg-[var(--v3-ink)] text-white"
                    : step.status === "active"
                      ? "bg-[var(--v3-orange)] text-white"
                      : "border border-[var(--v3-line-strong)] text-[var(--v3-faint)]")
                }
              >
                {step.status === "done" ? <Check className="h-4 w-4" aria-hidden /> : step.n}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-semibold text-[var(--v3-ink)]">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--v3-muted)]">{step.body}</p>
                {step.n === "02" && (
                  <div className="mt-3 flex items-center gap-2">
                    {CONNECT_PLATFORMS.map((platform) => (
                      <ChannelTile key={platform} platform={platform} className="h-7 w-7" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-6 max-w-[520px] text-xs leading-relaxed text-[var(--v3-faint)]">
          Early access · Connection requirements vary by service. Telegram requires a bot; Discord and Slack require
          appropriate permissions.
        </p>
      </div>
    </section>
  );
}
