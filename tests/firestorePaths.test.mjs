/**
 * Canonical Firestore path tests — legacy top-level ledgers must never return.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTIONS,
  SUBCOLLECTIONS,
  assertSafeSegment,
  clientPath,
  customerPath,
  customerTokenPath,
  loyaltyAccountPath,
  notificationsPath,
  rewardRedemptionsPath,
  reviewsPath,
  staffUserPath,
  stampTransactionsPath,
} from "../src/services/firestorePaths.ts";

test("uses only the canonical platform paths", () => {
  assert.equal(staffUserPath("uid1"), "staffUsers/uid1");
  assert.equal(clientPath("cli_1"), "clients/cli_1");
  assert.equal(customerPath("cust_1"), "customers/cust_1");
  assert.equal(customerTokenPath("a".repeat(64)), `customerTokens/${"a".repeat(64)}`);
  assert.equal(loyaltyAccountPath("cust_1"), "loyaltyAccounts/cust_1");
  assert.equal(
    stampTransactionsPath("cli_1"),
    "clients/cli_1/stampTransactions"
  );
  assert.equal(
    rewardRedemptionsPath("cli_1"),
    "clients/cli_1/rewardRedemptions"
  );
  assert.equal(notificationsPath("cli_1"), "clients/cli_1/notifications");
  assert.equal(reviewsPath("cli_1"), "clients/cli_1/reviews");
});

test("ledgers are nested under the business, never top-level", () => {
  assert.equal(COLLECTIONS.stampTransactions, undefined);
  assert.equal(COLLECTIONS.rewardRedemptions, undefined);
  assert.equal(SUBCOLLECTIONS.stampTransactions, "stampTransactions");
  assert.equal(SUBCOLLECTIONS.rewardRedemptions, "rewardRedemptions");
  assert.equal(SUBCOLLECTIONS.notifications, "notifications");
  assert.ok(stampTransactionsPath("cli_1").startsWith("clients/cli_1/"));
  assert.ok(rewardRedemptionsPath("cli_1").startsWith("clients/cli_1/"));
});

test("rejects unsafe document ids", () => {
  assert.equal(assertSafeSegment("cli_1", "clientId"), "cli_1");
  assert.throws(() => assertSafeSegment("", "clientId"));
  assert.throws(() => assertSafeSegment("   ", "clientId"));
  assert.throws(() => assertSafeSegment("a/b", "clientId"));
  assert.throws(() => assertSafeSegment("..", "clientId"));
  assert.throws(() => assertSafeSegment(42, "clientId"));
});
