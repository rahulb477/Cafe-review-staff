/**
 * Canonical document mappers — pure functions, unit tested.
 *
 * These translate the SHARED platform documents into the Staff App view models.
 * The critical mapping is clients/{clientId}: the platform stores the loyalty
 * configuration EMBEDDED in the client document:
 *
 *   clients/{clientId}
 *     slug, businessName, displayName, tagline, description, logo,
 *     theme.{primary,secondary,accent,background,text},
 *     loyalty.{enabled,stampTarget,rewardName,rewardDescription,rewardImage},
 *     status ("DRAFT" | "PUBLISHED" | "ACTIVE" | "SUSPENDED" | "ARCHIVED")
 *
 * The previous Staff App read top-level `stampTarget` / `rewardName`, which do
 * not exist in that schema — that is what produced
 * "Your assigned business configuration is incomplete in Firebase."
 */

import type { ClientConfig, StaffUser } from "./types";

export const DEFAULT_STAMP_TARGET = 8;
export const DEFAULT_REWARD_NAME = "Free Coffee";
export const MIN_STAMP_TARGET = 1;
export const MAX_STAMP_TARGET = 30;

export const INACTIVE_STAFF_STATUSES = [
  "inactive",
  "disabled",
  "suspended",
  "blocked",
  "deactivated",
  "removed",
] as const;

export type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

export function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function nonNegativeInt(value: unknown): number {
  const parsed = numberValue(value);
  if (parsed === undefined || parsed < 0) return 0;
  return Math.floor(parsed);
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const resolved = stringValue(value);
    if (resolved) return resolved;
  }
  return undefined;
}

/** `stampTarget` is clamped exactly like the Admin app clamps it (1..30, default 8). */
export function resolveStampTarget(...candidates: unknown[]): number {
  for (const candidate of candidates) {
    const parsed = numberValue(candidate);
    if (parsed !== undefined && Number.isInteger(parsed) && parsed >= MIN_STAMP_TARGET && parsed <= MAX_STAMP_TARGET) {
      return parsed;
    }
  }
  return DEFAULT_STAMP_TARGET;
}

export function initialsOf(value: string): string {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "ST";
  return parts.map((part) => part[0]!.toUpperCase()).join("");
}

export function isClientUsableStatus(status: string | undefined): boolean {
  if (!status) return true;
  return status.trim().toLowerCase() !== "archived";
}

/**
 * clients/{clientId} (+ id) → ClientConfig used by every Staff screen.
 * Never throws: a document that exists is always resolvable (the Admin app
 * applies the same defaulting when it reads clients/{clientId}.loyalty).
 */
export function buildClientConfig(clientId: string, data: unknown): ClientConfig {
  const record = asRecord(data);
  const loyalty = asRecord(record.loyalty);

  const name =
    firstString(record.displayName, record.businessName, record.name, record.slug) || clientId;
  const slug = firstString(record.slug, record.id, clientId) || clientId;
  const logoText = firstString(record.logoText, initialsOf(name), name) || name;

  const stampTarget = resolveStampTarget(
    loyalty.stampTarget,
    record.stampTarget,
    record.stampsRequired,
    record.stampsForReward
  );
  const rewardName =
    firstString(loyalty.rewardName, record.rewardName, record.rewardTitle) || DEFAULT_REWARD_NAME;
  const rewardDescription =
    firstString(loyalty.rewardDescription, record.rewardDescription) ||
    `Collect ${stampTarget} stamps to unlock your reward.`;
  const loyaltyEnabled = loyalty.enabled === undefined ? record.loyaltyEnabled !== false : loyalty.enabled !== false;

  const theme = asRecord(record.theme);

  return {
    id: clientId,
    clientId,
    slug,
    name,
    businessName: name,
    displayName: firstString(record.displayName, name) || name,
    tagline: firstString(record.tagline) || "LOYALTY PROGRAM",
    logoText,
    logoUrl: firstString(record.logo, record.logoUrl, record.logoText) ?? null,
    stampTarget,
    rewardName,
    rewardDescription,
    rewardImageUrl: firstString(loyalty.rewardImage, record.rewardImage) ?? null,
    loyaltyEnabled,
    primaryColor: firstString(theme.primary, record.primaryColor) || "#3A1E0D",
    accentColor: firstString(theme.accent, record.accentColor) || "#D4A373",
    iconType: firstString(record.iconType) || "coffee-bean",
    status: firstString(record.status),
  };
}

export interface StaffRecordValidation {
  ok: boolean;
  clientId?: string;
  status?: string;
  active?: boolean;
  reason?: "inactive" | "missingClientId" | "invalidClientId";
  /** Non-fatal notes surfaced only in development diagnostics. */
  notes: string[];
}

/**
 * staffUsers/{uid} validation — ONE staff member belongs to ONE business.
 * `clientId` (with a single-entry `clientIds` legacy fallback) is the only
 * source of the tenant; it is never taken from the URL, storage or any QR.
 */
export function validateStaffRecord(data: unknown): StaffRecordValidation {
  const record = asRecord(data);
  const notes: string[] = [];

  const statusRaw = firstString(record.status);
  const status = statusRaw ? statusRaw.toLowerCase() : undefined;
  const activeFlag = record.active === undefined ? undefined : record.active !== false;

  if (record.active === false) return { ok: false, reason: "inactive", status, active: false, notes };
  if (status && (INACTIVE_STAFF_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, reason: "inactive", status, active: false, notes };
  }
  if (record.active !== true && record.active !== false && !status) {
    notes.push("staffUsers document has neither `active` nor `status`; treated as active");
  }

  let clientId = firstString(record.clientId);
  if (!clientId) {
    const list = Array.isArray(record.clientIds) ? record.clientIds : [];
    const entries = list.map((item) => stringValue(item)).filter((item): item is string => Boolean(item));
    if (entries.length === 1) {
      clientId = entries[0];
      notes.push("resolved clientId from single-entry clientIds[] (legacy assignment list)");
    } else if (entries.length > 1) {
      notes.push("staffUsers document lists multiple businesses; only clientId is honoured");
    }
  }

  if (!clientId) return { ok: false, reason: "missingClientId", status, active: true, notes };
  if (clientId.length > 1500 || /[\/\\]/.test(clientId)) {
    return { ok: false, reason: "invalidClientId", status, active: true, notes };
  }

  return { ok: true, clientId, status, active: activeFlag ?? true, notes };
}

export interface StaffUserFallback {
  displayName?: string | null;
  email?: string | null;
}

/** staffUsers/{uid} (+ Firebase Auth user) → StaffUser view model. */
export function buildStaffUser(uid: string, data: unknown, fallback: StaffUserFallback = {}): StaffUser {
  const record = asRecord(data);
  const email =
    firstString(record.email, fallback.email ?? undefined) || firstString(fallback.email ?? undefined) || "";

  return {
    id: uid,
    uid,
    clientId: stringValue(record.clientId) || "",
    clientSlug: stringValue(record.clientId) || undefined,
    staffId: firstString(record.staffId, record.employeeId) || uid.substring(0, 8).toUpperCase(),
    name:
      firstString(record.name, record.displayName, fallback.displayName ?? undefined) ||
      email.split("@")[0] ||
      "Staff Member",
    email,
    phone: firstString(record.phone),
    role: firstString(record.role) || "Staff Member",
    active: record.active === undefined ? true : record.active !== false,
    status: firstString(record.status) || "active",
    avatarUrl: firstString(record.avatarUrl),
  };
}

/**
 * loyaltyAccounts/{customerId} → stamps for the assigned business.
 * A document claiming another business/customer is never surfaced.
 */
export function resolveLoyaltyState(
  customerId: string,
  clientId: string,
  loyaltyData: unknown
): { belongsToClient: boolean; stamps: number; stampTarget?: number; rewardName?: string; lastStampAt?: unknown } {
  const record = asRecord(loyaltyData);
  const docClientId = stringValue(record.clientId);
  const docCustomerId = stringValue(record.customerId);

  const belongsToClient =
    (!docClientId || docClientId === clientId) && (!docCustomerId || docCustomerId === customerId);

  if (!belongsToClient) {
    return { belongsToClient: false, stamps: 0 };
  }

  return {
    belongsToClient: true,
    stamps: nonNegativeInt(record.stamps),
    stampTarget: numberValue(record.stampTarget),
    rewardName: stringValue(record.rewardName),
    lastStampAt: record.lastStampAt,
  };
}

/**
 * Mirrors the Security Rules `oldVisits()` reader exactly: only a
 * non-negative integer `totalVisits` counts (anything else is 0). Keeping the
 * client-side baseline identical to the rules makes
 * `totalVisits == oldVisits() + 1` always true.
 */
export function visitBaseline(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

/**
 * True when a `clients/{clientId}/stampTransactions/{documentId}` row is a
 * stamp (a counted visit), false for reward redemptions. Used by the dashboard
 * so "today's stamps" is real ledger data, never a guess.
 */
export function isStampLedgerEntry(data: unknown): boolean {
  const record = asRecord(data);
  const type = stringValue(record.type);
  if (type === "REWARD_REDEEMED" || type === "REWARD") return false;
  if (type === "STAMP_ADDED") return true;
  const delta = numberValue(record.delta);
  if (delta !== undefined) return delta >= 1;
  return true;
}
