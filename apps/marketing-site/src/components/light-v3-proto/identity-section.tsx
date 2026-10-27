"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { ChannelTile, ChannelLabel, Avatar } from "./connector";
import { cn } from "@/lib/utils";

const DANIEL = {
  name: "Daniel K.",
  telegramPreview: "Are we still meeting on Thursday?",
  email: "daniel@example.com",
  emailPreview: "Here's the plan we talked about.",
};

type MatchState = "pending" | "connected" | "rejected";

/**
 * Second storytelling chapter: "different accounts → the same person."
 * One coherent product surface — Daniel's context, with the possible-match
 * suggestion as an inline row inside it, not a separate floating card.
 * Represents a single real moment: Telegram is connected, Email is
 * suggested but not yet approved, until the viewer decides.
 */
export function LightV3Identity() {
  const [state, setState] = useState<MatchState>("pending");

  return (
    <section id="identity" className="relative">
      <div className="mx-auto max-w-[1320px] px-6 pb-24 pt-4 sm:pb-28 sm:pt-6 lg:px-10 lg:pb-32 lg:pt-6">
        <div className="grid gap-16 lg:grid-cols-[440px_minmax(0,1fr)] lg:items-center lg:gap-20">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--v3-orange)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--v3-orange)]" aria-hidden />
              People, not platforms
            </p>
            <h2 className="mt-4 font-display text-[clamp(2.25rem,4.4vw,3.25rem)] font-semibold leading-[1.08] tracking-tight text-[var(--v3-ink)]">
              Different accounts.
              <br />
              <span className="text-[var(--v3-orange)]">The same Daniel.</span>
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--v3-muted)] sm:text-lg">
              Daniel might message you on Telegram today and email you tomorrow. Looktra helps you connect those
              accounts to one person — with your approval.
            </p>
          </div>

          {/* One product surface: Daniel's context, with the suggestion as
              an inline row inside it rather than a card placed over it. */}
          <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-[var(--v3-line)] bg-[var(--v3-surface)] shadow-[0_30px_70px_-32px_rgba(12,11,10,0.22)] lg:ml-auto">
            <div className="flex items-center gap-4 border-b border-[var(--v3-line)] px-6 py-5">
              <Avatar name={DANIEL.name} className="h-11 w-11 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-semibold text-[var(--v3-ink)]">{DANIEL.name}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-[var(--v3-faint)]">
                  Connected accounts
                  <span className="flex items-center gap-1.5">
                    <ChannelTile platform="Telegram" className="h-6 w-6" />
                    {state === "connected" && (
                      <ChannelTile platform="Email" className="h-6 w-6 shadow-[0_0_0_2px_var(--v3-orange)]" />
                    )}
                  </span>
                </p>
              </div>
            </div>

            <ul className="divide-y divide-[var(--v3-line)]">
              <li className="px-6 py-4">
                <p className="text-sm leading-relaxed text-[var(--v3-ink)]">{DANIEL.telegramPreview}</p>
                <p className="mt-1.5 text-xs">
                  <ChannelLabel platform="Telegram" />
                </p>
              </li>

              {state === "pending" && (
                <li className="bg-[var(--v3-orange-wash)] px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--v3-orange)]">
                    Possible match
                  </p>
                  <p className="mt-2.5 flex items-center gap-2 text-sm text-[var(--v3-ink)]">
                    <ChannelTile platform="Email" className="h-6 w-6" />
                    {DANIEL.email}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--v3-muted)]">
                    These accounts may belong to the same person.
                  </p>
                  <div className="mt-3.5 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setState("connected")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--v3-orange-button)] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--v3-orange-button-hover)]"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Connect account
                    </button>
                    <button
                      type="button"
                      onClick={() => setState("rejected")}
                      className="inline-flex h-9 items-center gap-1 text-xs font-medium text-[var(--v3-faint)] transition-colors hover:text-[var(--v3-muted)]"
                    >
                      <X className="h-3 w-3" aria-hidden />
                      Not Daniel
                    </button>
                  </div>
                </li>
              )}

              {state === "connected" && (
                <li className="px-6 py-4">
                  <p
                    className={cn(
                      "text-sm leading-relaxed text-[var(--v3-ink)]",
                      "animate-[v3-fade-up_0.4s_ease-out]",
                    )}
                  >
                    {DANIEL.emailPreview}
                  </p>
                  <p className="mt-1.5 flex items-center gap-2 text-xs">
                    <ChannelLabel platform="Email" />
                    <span className="inline-flex items-center gap-1 text-[var(--v3-orange)]">
                      <Check className="h-3 w-3" aria-hidden />
                      Just connected
                    </span>
                  </p>
                </li>
              )}

              {state === "rejected" && (
                <li className="px-6 py-4">
                  <p className="text-xs text-[var(--v3-faint)]">
                    Marked as a different person. Looktra won&rsquo;t suggest this match again.
                  </p>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
