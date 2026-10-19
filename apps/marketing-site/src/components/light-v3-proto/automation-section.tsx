import { Bell, Check } from "lucide-react";
import { ChannelTile } from "./connector";

/**
 * Chapter 4: "Nothing falls through the cracks." Illustrates the one rule
 * that's actually implemented end-to-end today (Telegram provider scope,
 * no-reply-after-N-hours trigger, notify-workspace action, delivered
 * in-app + push) — not a generic automation feature grid. One product
 * surface showing the rule itself plus the notification it produces, not
 * cards-per-step and not chat bubbles.
 */
export function LightV3Automation() {
  return (
    <section id="automation" className="relative">
      <div className="mx-auto max-w-[1320px] px-6 pb-24 pt-6 sm:pb-28 lg:px-10 lg:pb-32">
        <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:gap-20">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--v3-orange)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--v3-orange)]" aria-hidden />
              Never miss a beat
            </p>
            <h2 className="mt-4 font-display text-[clamp(2.25rem,4.4vw,3.25rem)] font-semibold leading-[1.08] tracking-tight text-[var(--v3-ink)]">
              Nothing falls through
              <br />
              <span className="text-[var(--v3-orange)]">the cracks.</span>
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--v3-muted)] sm:text-lg">
              Set reminders for conversations on your connected services. If no reply is sent within the hours you
              choose, Looktra can notify your workspace in the app and, with browser notifications enabled, through
              push.
            </p>
          </div>

          {/* One product surface: the saved rule, and the notification it
              produces. Not a feature grid, not chat bubbles. */}
          <div className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-[var(--v3-line)] bg-[var(--v3-surface)] shadow-[0_30px_70px_-32px_rgba(12,11,10,0.22)] lg:mx-auto">
            <div className="border-b border-[var(--v3-line)] px-6 py-5">
              <p className="font-display text-base font-semibold text-[var(--v3-ink)]">Reminder rule</p>
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-[var(--v3-faint)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--v3-orange)]" aria-hidden />
                Active
              </p>
            </div>

            <div className="px-6 py-6">
              <div className="flex items-center gap-3">
                <ChannelTile platform="Telegram" className="h-8 w-8 shrink-0" />
                <div>
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--v3-faint)]">
                    Trigger
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-[var(--v3-ink)]">No reply after 4 hours</p>
                </div>
              </div>

              <div className="my-4 ml-4 h-6 w-px bg-[var(--v3-line-strong)]" aria-hidden />

              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--v3-orange-wash)] text-[var(--v3-orange)]">
                  <Bell className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--v3-faint)]">
                    Action
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-[var(--v3-ink)]">Notify workspace</p>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-2 text-xs text-[var(--v3-faint)]">
                <span className="rounded-full border border-[var(--v3-line-strong)] px-2.5 py-1">In-app</span>
                <span className="rounded-full border border-[var(--v3-line-strong)] px-2.5 py-1">Push</span>
              </div>
            </div>

            {/* The notification this rule actually produces — same shape
                as the real notification.send action (title + body),
                nothing person-specific invented. */}
            <div className="border-t border-[var(--v3-line)] bg-[var(--v3-rail)] px-6 py-5">
              <div className="flex items-start gap-3 rounded-xl bg-[var(--v3-surface)] p-3.5 shadow-[0_14px_30px_-20px_rgba(12,11,10,0.2)]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--v3-orange)] text-white">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--v3-ink)]">Reminder: no reply in 4h</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--v3-muted)]">
                    A Telegram conversation is waiting for a reply.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
