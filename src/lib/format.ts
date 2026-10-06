/**
 * Pure presentation formatters shared by every Staff screen.
 *
 * They only ever format data that already came from Firebase — nothing here
 * invents a value, so an empty list still renders an honest empty state.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "Good morning" / "Good afternoon" / "Good evening" for the dashboard greeting. */
export function greetingForHour(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

export function greetingForDate(now: Date = new Date()): string {
  return greetingForHour(now.getHours());
}

/** "Monday, 6 Oct" — the subtle date line under the dashboard greeting. */
export function formatDayLabel(date: Date = new Date(), locale = "en-GB"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "short",
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

/** "06 Oct 2026, 09:41" for compact secondary timestamps. */
export function formatDateTime(millis: number | undefined, locale = "en-GB"): string | undefined {
  if (millis === undefined || !Number.isFinite(millis)) return undefined;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(millis));
  } catch {
    return undefined;
  }
}

/**
 * Relative time ("2 mins ago", "3 hours ago", "Yesterday").
 * Returns undefined for missing/invalid input so the caller can render an
 * honest placeholder instead of a fake "just now".
 */
export function relativeTimeFromMillis(
  millis: number | undefined,
  now: number = Date.now()
): string | undefined {
  if (millis === undefined || !Number.isFinite(millis)) return undefined;

  const diff = now - millis;
  if (diff < 0) {
    // Clock skew: a timestamp slightly in the future is still "just now".
    return Math.abs(diff) < MINUTE_MS ? "Just now" : formatDateTime(millis);
  }
  if (diff < MINUTE_MS) return "Just now";
  if (diff < HOUR_MS) {
    const minutes = Math.max(1, Math.floor(diff / MINUTE_MS));
    return `${minutes} ${minutes === 1 ? "min" : "mins"} ago`;
  }
  if (diff < DAY_MS) {
    const hours = Math.floor(diff / HOUR_MS);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (diff < 2 * DAY_MS) return "Yesterday";
  if (diff < 7 * DAY_MS) {
    const days = Math.floor(diff / DAY_MS);
    return `${days} days ago`;
  }
  return formatDateTime(millis);
}

export function relativeTime(
  iso: string | undefined,
  now: number = Date.now()
): string | undefined {
  if (!iso) return undefined;
  const millis = Date.parse(iso);
  if (Number.isNaN(millis)) return undefined;
  return relativeTimeFromMillis(millis, now);
}

/** "3 / 8" stamp fraction used by every loyalty surface. */
export function stampFraction(stamps: number, target: number): string {
  const safeTarget = Number.isFinite(target) && target > 0 ? Math.floor(target) : 0;
  const safeStamps = Number.isFinite(stamps) && stamps > 0 ? Math.floor(stamps) : 0;
  return `${safeStamps} / ${safeTarget}`;
}

/** "5 more stamps for Free Coffee" / "1 more stamp for Free Coffee". */
export function stampsRemainingCopy(stamps: number, target: number, rewardName: string): string {
  const remaining = Math.max(0, Math.floor(target) - Math.floor(stamps));
  if (remaining <= 0) return `${rewardName} is ready to redeem`;
  return `${remaining} more ${remaining === 1 ? "stamp" : "stamps"} for ${rewardName}`;
}

export function loyaltyProgressPercent(stamps: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, (Number.isFinite(stamps) ? stamps : 0) / target));
  return Math.round(ratio * 100);
}

/** Single-letter avatar initial, always uppercase and never empty. */
export function initialOf(name: string | undefined, fallback = "C"): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return fallback;
  return trimmed.charAt(0).toUpperCase();
}

/** Deterministic warm avatar tint for a customer id (no random colours). */
const AVATAR_TINTS = [
  "#f0e2cf",
  "#e7ddcd",
  "#eee0d6",
  "#e2e7dc",
  "#e6e0ea",
  "#f2e3d4",
  "#e0e6ec",
] as const;

export function avatarTintFor(seed: string | undefined): string {
  const value = (seed ?? "").trim();
  if (!value) return AVATAR_TINTS[0];
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100003;
  }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}
