/**
 * Priority-based notification sounds (docs/ROADMAP.md Phase 11) - synthesized
 * tones via the Web Audio API rather than shipped audio assets, so there's
 * no licensing/asset question and the tiers are trivially adjustable.
 * Disclosed simplification vs. the checklist's "custom sounds per
 * VIP/contact" item: only priority-tier sounds exist, not a per-contact
 * sound picker - see docs/reviews/phase-11-review.md.
 *
 * Browsers block audio until a user gesture occurs on the page
 * (autoplay policy) - the very first chime after a fresh page load may be
 * silently skipped for that reason. This is expected browser behavior, not
 * a bug, and every call is wrapped so a blocked/unsupported AudioContext
 * never breaks the Inbox.
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  return audioContext;
}

function beep(ctx: AudioContext, frequency: number, durationMs: number, delayMs: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.value = frequency;
  oscillator.connect(gain);
  gain.connect(ctx.destination);

  const startTime = ctx.currentTime + delayMs / 1000;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationMs / 1000);

  oscillator.start(startTime);
  oscillator.stop(startTime + durationMs / 1000 + 0.02);
}

/** Matches the tiers `apps/web/components/Inbox.tsx`'s "Needs You" badge and Phase 9's priority scoring already use (30 = Needs You threshold, 60 = VIP-tier). */
export function playPriorityChime(priorityScore: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (priorityScore >= 60) {
      beep(ctx, 880, 120, 0); // VIP/urgent tier - three ascending beeps
      beep(ctx, 1046, 120, 150);
      beep(ctx, 1318, 160, 300);
    } else if (priorityScore >= 30) {
      beep(ctx, 660, 120, 0); // Needs-You tier - two beeps
      beep(ctx, 880, 140, 150);
    } else {
      beep(ctx, 440, 100, 0); // routine message - one soft beep
    }
  } catch {
    // AudioContext blocked (autoplay policy) or unsupported - never break the Inbox over a sound cue.
  }
}
