/**
 * Shared Staff App formatters.
 *
 * Timestamp parsing lives here so Firebase Timestamp objects, native Dates,
 * ISO strings and serialized Firestore timestamp objects are treated the same
 * everywhere. Missing or malformed data never leaks "Invalid Date" into UI.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MAX_DATE_MILLIS = 8.64e15;
export const MISSING_DATE_LABEL = "—";

/** Parse all timestamp shapes used by Firestore and its JSON serializers. */
export function timestampToMillis(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  if (value instanceof Date) {
    const millis = value.getTime();
    return isValidMillis(millis) ? millis : undefined;
  }

  if (typeof value === "number") return isValidMillis(value) ? value : undefined;

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return undefined;
    const millis = Date.parse(text);
    return isValidMillis(millis) ? millis : undefined;
  }

  if (typeof value !== "object") return undefined;

  const candidate = value as {
    toMillis?: () => number;
    toDate?: () => Date;
    seconds?: unknown;
    nanoseconds?: unknown;
    _seconds?: unknown;
    _nanoseconds?: unknown;
  };

  if (typeof candidate.toMillis === "function") {
    try {
      const millis = candidate.toMillis();
      if (isValidMillis(millis)) return millis;
    } catch {
      // Fall through to the other Firestore/serialized representations.
    }
  }

  if (typeof candidate.toDate === "function") {
    try {
      const date = candidate.toDate();
      const millis = date instanceof Date ? date.getTime() : Number.NaN;
      if (isValidMillis(millis)) return millis;
    } catch {
      // Malformed SDK-like object: try the serialized seconds fields below.
    }
  }

  const seconds = finiteNumber(candidate.seconds ?? candidate._seconds);
  const nanoseconds = finiteNumber(candidate.nanoseconds ?? candidate._nanoseconds) ?? 0;
  if (
    seconds === undefined ||
    !Number.isInteger(seconds) ||
    !Number.isInteger(nanoseconds) ||
    nanoseconds < 0 ||
    nanoseconds >= 1_000_000_000
  ) {
    return undefined;
  }

  const millis = seconds * 1000 + nanoseconds / 1_000_000;
  return isValidMillis(millis) ? millis : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isValidMillis(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= MAX_DATE_MILLIS;
}

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
export function formatDayLabel(value: unknown = new Date(), locale = "en-GB"): string {
  const millis = timestampToMillis(value);
  if (millis === undefined) return MISSING_DATE_LABEL;
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "short",
    }).format(new Date(millis));
  } catch {
    return MISSING_DATE_LABEL;
  }
}

/** A shared full date-and-time label; missing or invalid values render an em dash. */
export function formatTimestamp(value: unknown, locale = "en-US"): string {
  const millis = timestampToMillis(value);
  if (millis === undefined) return MISSING_DATE_LABEL;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(millis));
  } catch {
    return MISSING_DATE_LABEL;
  }
}

/** A shared time-only label for activity/notification rows. */
export function formatTimestampTime(value: unknown, locale = "en-US"): string {
  const millis = timestampToMillis(value);
  if (millis === undefined) return MISSING_DATE_LABEL;
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(millis));
  } catch {
    return MISSING_DATE_LABEL;
  }
}

/** ISO serialization for sorting and date comparisons; invalid values stay absent. */
export function timestampToIso(value: unknown): string | undefined {
  const millis = timestampToMillis(value);
  if (millis === undefined) return undefined;
  try {
    return new Date(millis).toISOString();
  } catch {
    return undefined;
  }
}

/** "06 Oct 2026, 09:41" for compact secondary timestamps. */
export function formatDateTime(millis: number | undefined, locale = "en-GB"): string | undefined {
  if (millis === undefined || !isValidMillis(millis)) return undefined;
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
 * Returns undefined for missing/invalid input so a caller can render "—".
 */
export function relativeTimeFromMillis(
  millis: number | undefined,
  now: number = Date.now()
): string | undefined {
  if (millis === undefined || !isValidMillis(millis) || !Number.isFinite(now)) return undefined;

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

export function relativeTime(value: unknown, now: number = Date.now()): string | undefined {
  const millis = timestampToMillis(value);
  return millis === undefined ? undefined : relativeTimeFromMillis(millis, now);
}

/** True when a timestamp belongs to the same local calendar day as `day`. */
export function isSameLocalDay(value: unknown, day: Date | null): boolean {
  if (!day) return false;
  const millis = timestampToMillis(value);
  if (millis === undefined) return false;
  const stamp = new Date(millis);
  return (
    stamp.getFullYear() === day.getFullYear() &&
    stamp.getMonth() === day.getMonth() &&
    stamp.getDate() === day.getDate()
  );
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
