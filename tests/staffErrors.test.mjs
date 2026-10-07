/**
 * Error taxonomy regression tests — the screenshot error must never be shown
 * for an unrelated failure, and every real failure must keep its own message.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAFF_ERROR_MESSAGES,
  StampCooldownError,
  StaffServiceError,
  describeErrorForDiagnostics,
  isMissingIndexError,
  isOfflineError,
  isPermissionDeniedError,
  toStaffServiceError,
} from "../src/services/staffErrors.ts";

test("keeps the exact specification copy for every case", () => {
  assert.equal(STAFF_ERROR_MESSAGES.STAFF_NOT_FOUND, "Staff account not found.");
  assert.equal(STAFF_ERROR_MESSAGES.STAFF_INACTIVE, "Your staff account is inactive.");
  assert.equal(
    STAFF_ERROR_MESSAGES.STAFF_NO_CLIENT,
    "Your staff account is not assigned to a business."
  );
  assert.equal(STAFF_ERROR_MESSAGES.CLIENT_NOT_FOUND, "Assigned business could not be found.");
  assert.equal(
    STAFF_ERROR_MESSAGES.PERMISSION_DENIED,
    "Your staff account does not have permission for this business."
  );
  assert.equal(STAFF_ERROR_MESSAGES.CUSTOMER_NOT_FOUND, "Customer not found.");
  assert.equal(
    STAFF_ERROR_MESSAGES.CROSS_BUSINESS,
    "This customer belongs to another business."
  );
  assert.equal(STAFF_ERROR_MESSAGES.INVALID_QR, "Invalid customer QR code.");
  assert.equal(STAFF_ERROR_MESSAGES.NETWORK, "Connection problem. Please try again.");
  assert.equal(
    STAFF_ERROR_MESSAGES.FIREBASE_CONFIG,
    "Staff Firebase configuration could not be loaded."
  );
});

test("maps Firebase codes to precise staff errors", () => {
  const permissionDenied = toStaffServiceError(
    Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" })
  );
  assert.equal(permissionDenied.staffCode, "PERMISSION_DENIED");
  assert.equal(permissionDenied.message, "Your staff account does not have permission for this business.");

  const unavailable = toStaffServiceError(
    Object.assign(new Error("Failed to get document because the client is offline."), {
      code: "unavailable",
    })
  );
  assert.equal(unavailable.staffCode, "NETWORK");
  assert.equal(unavailable.message, "Connection problem. Please try again.");

  const deadline = toStaffServiceError(Object.assign(new Error("deadline"), { code: "deadline-exceeded" }));
  assert.equal(deadline.staffCode, "NETWORK");

  const invalidCredential = toStaffServiceError(
    Object.assign(new Error("bad"), { code: "auth/invalid-credential" })
  );
  assert.equal(invalidCredential.staffCode, "AUTH_FAILED");
  assert.equal(invalidCredential.message, "Invalid email or password.");

  const userDisabled = toStaffServiceError(
    Object.assign(new Error("disabled"), { code: "auth/user-disabled" })
  );
  assert.equal(userDisabled.staffCode, "AUTH_DISABLED");

  const badApiKey = toStaffServiceError(
    Object.assign(new Error("API key not valid"), { code: "auth/api-key-not-valid.-please-pass-a-valid-api-key." })
  );
  assert.equal(badApiKey.staffCode, "FIREBASE_CONFIG");
  assert.equal(badApiKey.message, "Staff Firebase configuration could not be loaded.");
});

test("never converts a permission or network failure into a configuration message", () => {
  const permission = toStaffServiceError(
    Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" })
  );
  assert.notEqual(permission.message, STAFF_ERROR_MESSAGES.FIREBASE_CONFIG);
  assert.notEqual(permission.message, STAFF_ERROR_MESSAGES.CLIENT_CONFIG_INVALID);

  const offline = toStaffServiceError(new Error("network request failed"));
  assert.equal(offline.staffCode, "NETWORK");
  assert.notEqual(offline.message, STAFF_ERROR_MESSAGES.FIREBASE_CONFIG);
});

test("keeps the raw Firebase error available for diagnostics", () => {
  const error = toStaffServiceError(
    Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }),
    "PERMISSION_DENIED",
    { path: "clients/cli_1/stampTransactions/tx_1" }
  );
  const diagnostics = describeErrorForDiagnostics(error);
  assert.match(diagnostics, /permission-denied/);
  assert.match(diagnostics, /clients\/cli_1\/stampTransactions\/tx_1/);
  assert.match(diagnostics, /Missing or insufficient permissions/);
});

test("recognises error classes without relying on message parsing alone", () => {
  assert.equal(isPermissionDeniedError({ code: "firestore/permission-denied" }), true);
  assert.equal(isPermissionDeniedError(new Error("nope")), false);
  assert.equal(isOfflineError({ code: "firestore/unavailable" }), true);
  assert.equal(isOfflineError(new Error("all good")), false);
});

test("distinguishes missing indexes, not-found, permission, network and unknown", () => {
  const missingIndex = Object.assign(new Error("The query requires an index. You can create it here."), {
    code: "failed-precondition",
  });
  assert.equal(isMissingIndexError(missingIndex), true);
  assert.equal(toStaffServiceError(missingIndex).staffCode, "MISSING_INDEX");
  assert.equal(
    toStaffServiceError(missingIndex).message,
    "Data index is being prepared. Please try again shortly."
  );

  const otherPrecondition = Object.assign(new Error("The client is not in a valid state."), {
    code: "failed-precondition",
  });
  assert.equal(isMissingIndexError(otherPrecondition), false);
  assert.equal(toStaffServiceError(otherPrecondition).staffCode, "UNKNOWN");

  const notFound = toStaffServiceError(Object.assign(new Error("missing"), { code: "not-found" }));
  assert.equal(notFound.staffCode, "NOT_FOUND");
  assert.equal(notFound.message, "No customer data was found.");

  const permission = toStaffServiceError(Object.assign(new Error("denied"), { code: "permission-denied" }));
  assert.equal(permission.staffCode, "PERMISSION_DENIED");
  const network = toStaffServiceError(Object.assign(new Error("offline"), { code: "unavailable" }));
  assert.equal(network.staffCode, "NETWORK");
});

test("preserves an existing staff error and only merges new technical detail", () => {
  const original = new StaffServiceError("CROSS_BUSINESS", { technical: { path: "customerTokens/t" } });
  const merged = toStaffServiceError(original, "UNKNOWN", { detail: "extra" });
  assert.equal(merged.staffCode, "CROSS_BUSINESS");
  assert.equal(merged.message, STAFF_ERROR_MESSAGES.CROSS_BUSINESS);
  assert.equal(merged.technical.path, "customerTokens/t");
  assert.equal(merged.technical.detail, "extra");
});

test("cooldown failures preserve structured server-rejection details", () => {
  const lastStampAt = { seconds: 1_800_000_000 };
  const nextStampAt = { seconds: 1_800_043_200 };
  const cooldown = new StampCooldownError({
    lastStampAt,
    nextStampAt,
    remainingMs: 17 * 60_000,
    message: "Stamp already added recently. Next stamp available in 17m.",
    technical: { code: "permission-denied" },
  });
  const mapped = toStaffServiceError(cooldown, "UNKNOWN");
  assert.ok(mapped instanceof StampCooldownError);
  assert.equal(mapped.staffCode, "STAMP_COOLDOWN");
  assert.deepEqual(mapped.details, {
    reason: "STAMP_COOLDOWN",
    lastStampAt,
    nextStampAt,
    remainingMs: 17 * 60_000,
  });
});
