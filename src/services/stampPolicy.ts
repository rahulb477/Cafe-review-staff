/** Normal staff stamps are separated by an exact 12-hour server-time window. */
export const STAMP_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export interface StampCooldownState {
  eligible: boolean;
  nextStampAtMillis?: number;
  remainingMs: number;
}

/**
 * Pure cooldown calculation shared by error copy and tests.
 *
 * `authoritativeNowMillis` must be the server's decision time when used to
 * authorize a write. The browser only calls this after Firestore Rules have
 * already rejected/accepted the write, for informational error copy; it is
 * never the write gate.
 */
export function getStampCooldownState(
  lastStampAtMillis: number | undefined,
  authoritativeNowMillis: number
): StampCooldownState {
  if (
    lastStampAtMillis === undefined ||
    !Number.isFinite(lastStampAtMillis) ||
    !Number.isFinite(authoritativeNowMillis)
  ) {
    return { eligible: true, remainingMs: 0 };
  }

  const nextStampAtMillis = lastStampAtMillis + STAMP_COOLDOWN_MS;
  const remainingMs = Math.max(0, nextStampAtMillis - authoritativeNowMillis);
  return {
    eligible: remainingMs === 0,
    nextStampAtMillis,
    remainingMs,
  };
}

function nonNegativeInt(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

/** Preserve the largest trustworthy lifetime value; never reduce stamp history. */
export function reconcileLifetimeStamps(
  currentStamps: unknown,
  storedLifetimeStamps: unknown,
  historicalStampCount: number | undefined
): number {
  return Math.max(
    nonNegativeInt(currentStamps),
    nonNegativeInt(storedLifetimeStamps),
    nonNegativeInt(historicalStampCount)
  );
}

/** Short informational copy; it does not authorize or schedule a stamp. */
export function formatCooldownRemaining(remainingMs: number): string {
  const safeRemainingMs = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : 0;
  const totalMinutes = Math.ceil(safeRemainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}
