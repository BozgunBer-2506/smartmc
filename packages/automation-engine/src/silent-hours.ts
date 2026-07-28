/** A minimal notification-preference shape (docs/DATABASE.md Section 6.14) - just the fields the Context Object's `workspace.isSilentHours`/`isVipOverrideActive` and `message.matchesKeywordAlert` need. */
export interface NotificationPreferenceInput {
  silentHoursStart: string | null; // "HH:mm"
  silentHoursEnd: string | null;
  vipOverrideEnabled: boolean;
  keywordAlerts: string[];
}

/** "HH:mm" in the given IANA timezone, at `now`. */
function currentTimeInZone(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * AUTOMATION_ENGINE.md Section 3.3: workspace-timezone-aware, and a
 * silent-hours window can wrap midnight (e.g. "22:00"-"06:00") - handled
 * by treating "end < start" as spanning across midnight rather than
 * requiring the caller to split it into two rules.
 */
export function isSilentHoursActive(pref: NotificationPreferenceInput | null, timezone: string, now: Date = new Date()): boolean {
  if (!pref?.silentHoursStart || !pref?.silentHoursEnd) return false;

  const current = toMinutes(currentTimeInZone(timezone, now));
  const start = toMinutes(pref.silentHoursStart);
  const end = toMinutes(pref.silentHoursEnd);

  if (start === end) return false; // a zero-width window is not a configured window
  if (start < end) return current >= start && current < end;
  return current >= start || current < end; // wraps midnight
}

export function isVipOverrideActive(pref: NotificationPreferenceInput | null, timezone: string, senderIsVip: boolean, now: Date = new Date()): boolean {
  if (!pref?.vipOverrideEnabled) return false;
  return isSilentHoursActive(pref, timezone, now) && senderIsVip;
}

export function matchesAnyKeyword(bodyText: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const lowerBody = bodyText.toLowerCase();
  return keywords.some((k) => k.trim().length > 0 && lowerBody.includes(k.toLowerCase()));
}
