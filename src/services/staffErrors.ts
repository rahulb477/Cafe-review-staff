/**
 * Staff App error taxonomy.
 *
 * Every authorization / Firebase failure is mapped to ONE precise code so the UI
 * can never show a generic "configuration incomplete" message for an unrelated
 * problem (network, permission denied, auth still loading, ...).
 *
 * The exact technical error (Firebase code + message + collection path) is kept
 * on the error object and logged as diagnostics; only the human message is shown.
 */

export type StaffErrorCode =
  | "STAFF_NOT_FOUND"
  | "STAFF_INACTIVE"
  | "STAFF_NO_CLIENT"
  | "CLIENT_NOT_FOUND"
  | "CLIENT_CONFIG_INVALID"
  | "PERMISSION_DENIED"
  | "CUSTOMER_NOT_FOUND"
  | "CROSS_BUSINESS"
  | "INVALID_QR"
  | "TOKEN_NOT_LINKED"
  | "NETWORK"
  | "MISSING_INDEX"
  | "NOT_FOUND"
  | "AUTH_REQUIRED"
  | "AUTH_FAILED"
  | "AUTH_DISABLED"
  | "FIREBASE_CONFIG"
  | "FIRESTORE_UNAVAILABLE"
  | "LOYALTY_DISABLED"
  | "NOT_ELIGIBLE"
  | "STAMP_COOLDOWN"
  | "DUPLICATE_OPERATION"
  | "NOTIFICATIONS_UNAVAILABLE"
  | "UNKNOWN";

/** Exact user-facing copy required by the Staff App specification. */
export const STAFF_ERROR_MESSAGES: Record<StaffErrorCode, string> = {
  STAFF_NOT_FOUND: "Staff account not found.",
  STAFF_INACTIVE: "Your staff account is inactive.",
  STAFF_NO_CLIENT: "Your staff account is not assigned to a business.",
  CLIENT_NOT_FOUND: "Assigned business could not be found.",
  CLIENT_CONFIG_INVALID: "Assigned business could not be found.",
  PERMISSION_DENIED: "Your staff account does not have permission for this business.",
  CUSTOMER_NOT_FOUND: "Customer not found.",
  CROSS_BUSINESS: "This customer belongs to another business.",
  INVALID_QR: "Invalid customer QR code.",
  TOKEN_NOT_LINKED: "Invalid customer QR code.",
  NETWORK: "Connection problem. Please try again.",
  MISSING_INDEX: "Data index is being prepared. Please try again shortly.",
  NOT_FOUND: "No customer data was found.",
  AUTH_REQUIRED: "Please sign in to continue.",
  AUTH_FAILED: "Invalid email or password.",
  AUTH_DISABLED: "Your staff account is inactive.",
  FIREBASE_CONFIG: "Staff Firebase configuration could not be loaded.",
  FIRESTORE_UNAVAILABLE: "Connection problem. Please try again.",
  LOYALTY_DISABLED: "The loyalty programme is switched off for this business.",
  NOT_ELIGIBLE: "This customer is not eligible for the reward yet.",
  STAMP_COOLDOWN: "Stamp already added recently.",
  DUPLICATE_OPERATION: "This operation was already processed.",
  NOTIFICATIONS_UNAVAILABLE: "Notifications are unavailable right now.",
  UNKNOWN: "Something went wrong. Please try again.",
};

export interface StaffErrorTechnical {
  /** Raw Firebase / Firestore error code, e.g. `permission-denied`. */
  code?: string;
  /** Raw Firebase message. */
  message?: string;
  /** Canonical Firestore path or operation that failed. */
  path?: string;
  /** Free-form short explanation for diagnostics. */
  detail?: string;
}

export class StaffServiceError extends Error {
  readonly staffCode: StaffErrorCode;
  readonly technical: StaffErrorTechnical;

  constructor(
    staffCode: StaffErrorCode,
    options: { message?: string; technical?: StaffErrorTechnical; cause?: unknown } = {}
  ) {
    super(options.message || STAFF_ERROR_MESSAGES[staffCode]);
    this.name = "StaffServiceError";
    this.staffCode = staffCode;
    this.technical = options.technical ?? {};
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface StampCooldownDetails {
  reason: "STAMP_COOLDOWN";
  lastStampAt: unknown;
  nextStampAt: unknown;
  /** Display estimate only. Firestore Rules use request.time for enforcement. */
  remainingMs: number;
}

/** A structured, user-safe cooldown rejection returned after Firestore denies the write. */
export class StampCooldownError extends StaffServiceError {
  readonly reason = "STAMP_COOLDOWN" as const;
  readonly lastStampAt: unknown;
  readonly nextStampAt: unknown;
  readonly remainingMs: number;

  constructor(options: {
    lastStampAt: unknown;
    nextStampAt: unknown;
    remainingMs: number;
    message: string;
    technical?: StaffErrorTechnical;
  }) {
    super("STAMP_COOLDOWN", { message: options.message, technical: options.technical });
    this.name = "StampCooldownError";
    this.lastStampAt = options.lastStampAt;
    this.nextStampAt = options.nextStampAt;
    this.remainingMs = options.remainingMs;
  }

  get details(): StampCooldownDetails {
    return {
      reason: this.reason,
      lastStampAt: this.lastStampAt,
      nextStampAt: this.nextStampAt,
      remainingMs: this.remainingMs,
    };
  }
}

export function staffError(
  staffCode: StaffErrorCode,
  technical: StaffErrorTechnical = {},
  message?: string
): StaffServiceError {
  return new StaffServiceError(staffCode, { message, technical });
}

/** Firebase error codes are surfaced as `code` on thrown objects. */
export function readErrorCode(error: unknown): string {
  if (typeof error === "string") return error;
  const value = error as { code?: unknown } | null | undefined;
  return typeof value?.code === "string" ? value.code : "";
}

export function readErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  const value = error as { message?: unknown } | null | undefined;
  return typeof value?.message === "string" ? value.message : "";
}

export function isFirebaseConfigError(error: unknown): boolean {
  const code = readErrorCode(error);
  const message = readErrorMessage(error).toLowerCase();
  return (
    code.includes("auth/api-key-not-valid") ||
    code.includes("auth/invalid-api-key") ||
    code.includes("auth/configuration-not-found") ||
    code.includes("auth/invalid-app-credential") ||
    code.includes("firebase/configuration") ||
    code.startsWith("staff/firebase") ||
    message.includes("api-key") ||
    message.includes("firebase configuration")
  );
}

export function isPermissionDeniedError(error: unknown): boolean {
  const code = readErrorCode(error);
  const message = readErrorMessage(error).toLowerCase();
  return (
    code === "permission-denied" ||
    code.endsWith("/permission-denied") ||
    code.includes("permission-denied") ||
    message.includes("missing or insufficient permissions") ||
    message.includes("insufficient permissions")
  );
}

export function isUnauthenticatedError(error: unknown): boolean {
  const code = readErrorCode(error);
  return code.includes("unauthenticated") || code.includes("auth/argument-error");
}

/** Firestore uses failed-precondition for missing composite indexes. */
export function isMissingIndexError(error: unknown): boolean {
  const code = readErrorCode(error).toLowerCase();
  const message = readErrorMessage(error).toLowerCase();
  return (
    (code === "failed-precondition" || code.endsWith("/failed-precondition")) &&
    /(?:query requires an index|requires an index|index (?:is )?(?:missing|building|not ready)|missing (?:a )?composite index)/i.test(
      message
    )
  );
}

export function isOfflineError(error: unknown): boolean {
  const code = readErrorCode(error);
  const message = readErrorMessage(error).toLowerCase();
  if (
    code === "unavailable" ||
    code.endsWith("/unavailable") ||
    code === "deadline-exceeded" ||
    code.endsWith("/deadline-exceeded") ||
    code === "resource-exhausted" ||
    code.endsWith("/resource-exhausted") ||
    code === "aborted" ||
    code.endsWith("/aborted") ||
    code === "internal" ||
    code.endsWith("/internal") ||
    code === "cancelled" ||
    code.endsWith("/cancelled")
  ) {
    return true;
  }
  return (
    message.includes("network") ||
    message.includes("offline") ||
    message.includes("failed to fetch") ||
    message.includes("could not reach") ||
    message.includes("timeout") ||
    message.includes("backend didn't respond")
  );
}

/**
 * Maps ANY thrown value to a StaffServiceError with a precise message.
 * `fallback` is used when the error is not recognised.
 */
export function toStaffServiceError(
  error: unknown,
  fallback: StaffErrorCode = "UNKNOWN",
  technical: StaffErrorTechnical = {}
): StaffServiceError {
  if (error instanceof StampCooldownError) {
    const merged = { ...error.technical, ...technical };
    if (Object.keys(merged).length === 0) return error;
    return new StampCooldownError({
      lastStampAt: error.lastStampAt,
      nextStampAt: error.nextStampAt,
      remainingMs: error.remainingMs,
      message: error.message,
      technical: merged,
    });
  }

  if (error instanceof StaffServiceError) {
    const merged = { ...error.technical, ...technical };
    if (Object.keys(merged).length === 0) return error;
    return new StaffServiceError(error.staffCode, {
      message: error.message,
      technical: merged,
      cause: error,
    });
  }

  const code = readErrorCode(error);
  const message = readErrorMessage(error);
  const base: StaffErrorTechnical = { ...technical, code: code || undefined, message: message || undefined };

  if (isFirebaseConfigError(error)) return staffError("FIREBASE_CONFIG", base);
  if (isPermissionDeniedError(error)) return staffError("PERMISSION_DENIED", base);
  if (isMissingIndexError(error)) return staffError("MISSING_INDEX", base);
  if (code === "not-found" || code.endsWith("/not-found")) return staffError("NOT_FOUND", base);
  if (isUnauthenticatedError(error)) return staffError("AUTH_REQUIRED", base);
  if (isOfflineError(error)) return staffError("NETWORK", base);

  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) {
    return staffError("AUTH_FAILED", base);
  }
  if (code.includes("auth/user-not-found")) return staffError("AUTH_FAILED", base);
  if (code.includes("auth/too-many-requests")) {
    return staffError("AUTH_FAILED", base, "Too many attempts. Please try again later.");
  }
  if (code.includes("auth/user-disabled")) return staffError("AUTH_DISABLED", base);
  if (code.includes("auth/invalid-email")) {
    return staffError("AUTH_FAILED", base, "Please enter a valid staff email address.");
  }

  return staffError(fallback, { ...base, message: message || undefined });
}

/** Raw diagnostics for development consoles — never rendered as the only message. */
export function describeErrorForDiagnostics(error: unknown): string {
  const wrapped = error instanceof StaffServiceError ? error : null;
  const staffCode: StaffErrorCode | "unmapped" = wrapped ? wrapped.staffCode : "unmapped";
  const technical = wrapped?.technical ?? {};
  // The wrapper carries the original Firebase code/message in `technical`.
  const code = technical.code || readErrorCode(error);
  const ownMessage = readErrorMessage(error);
  const message =
    wrapped && wrapped.message === ownMessage && technical.message
      ? technical.message
      : ownMessage || technical.message || "";
  return [
    `staffCode=${staffCode}`,
    code ? `firebaseCode=${code}` : null,
    technical.path ? `path=${technical.path}` : null,
    technical.detail ? `detail=${technical.detail}` : null,
    message ? `message=${message}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
