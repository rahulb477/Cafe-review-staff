/**
 * Client / staff registry mapping regression tests.
 *
 * Root cause of the production error
 *   "Your assigned business configuration is incomplete in Firebase."
 * was that the Staff App read top-level `stampTarget` / `rewardName` from
 * clients/{clientId}, while the platform stores them embedded in
 * clients/{clientId}.loyalty.{stampTarget,rewardName}.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REWARD_NAME,
  DEFAULT_STAMP_TARGET,
  buildClientConfig,
  buildStaffUser,
  isRewardRedeemable,
  isStampLedgerEntry,
  nextStampBalance,
  remainingStampsAfterRedemption,
  resolveLoyaltyState,
  stampVisitAlreadyApplied,
  resolveStampTarget,
  validateStaffRecord,
  visitBaseline,
} from "../src/services/clientConfig.ts";

/** Shape written by the Admin app when a store is published. */
const canonicalClient = {
  id: "cli_bake01",
  slug: "bake",
  businessName: "BAKE Patisserie",
  displayName: "BAKE",
  tagline: "BAKERY & CAFE",
  description: "Freshly baked",
  logo: null,
  theme: { primary: "#3A2116", secondary: "#5A3524", accent: "#C0651E", background: "#F7EFE3" },
  loyalty: {
    enabled: true,
    stampTarget: 10,
    rewardName: "Free Croissant",
    rewardDescription: "One free croissant",
    rewardImage: null,
  },
  status: "PUBLISHED",
};

test("resolves the embedded loyalty config (screenshot error regression)", () => {
  const config = buildClientConfig("cli_bake01", canonicalClient);
  assert.equal(config.name, "BAKE");
  assert.equal(config.slug, "bake");
  assert.equal(config.stampTarget, 10);
  assert.equal(config.rewardName, "Free Croissant");
  assert.equal(config.rewardDescription, "One free croissant");
  assert.equal(config.loyaltyEnabled, true);
  assert.equal(config.primaryColor, "#3A2116");
  assert.equal(config.accentColor, "#C0651E");
  assert.equal(config.status, "PUBLISHED");
});

test("maps the optional reward artwork from loyalty.rewardImage", () => {
  // The canonical fixture stores rewardImage: null — that must stay null so the
  // UI falls back to its inline illustration instead of a broken <img>.
  assert.equal(buildClientConfig("cli_bake01", canonicalClient).rewardImageUrl, null);

  const withArt = {
    ...canonicalClient,
    loyalty: { ...canonicalClient.loyalty, rewardImage: "https://cdn.example.test/free-coffee.png" },
  };
  assert.equal(
    buildClientConfig("cli_bake01", withArt).rewardImageUrl,
    "https://cdn.example.test/free-coffee.png"
  );

  // Legacy flat field is still accepted.
  assert.equal(
    buildClientConfig("c1", { displayName: "Minimal Cafe", rewardImage: "/r.png" }).rewardImageUrl,
    "/r.png"
  );
});

test("honours loyalty.enabled=false", () => {
  const config = buildClientConfig("c1", { ...canonicalClient, loyalty: { enabled: false } });
  assert.equal(config.loyaltyEnabled, false);
  // A switched-off programme still resolves a usable configuration.
  assert.equal(config.stampTarget, DEFAULT_STAMP_TARGET);
  assert.equal(config.rewardName, DEFAULT_REWARD_NAME);
});

test("still supports legacy flat fields", () => {
  const config = buildClientConfig("c1", {
    name: "Legacy Cafe",
    stampTarget: 6,
    rewardName: "Free Chai",
    primaryColor: "#111111",
    accentColor: "#222222",
  });
  assert.equal(config.name, "Legacy Cafe");
  assert.equal(config.stampTarget, 6);
  assert.equal(config.rewardName, "Free Chai");
});

test("applies the platform defaults for a sparse but valid client document", () => {
  const config = buildClientConfig("cli_min", { displayName: "Minimal Cafe" });
  assert.equal(config.name, "Minimal Cafe");
  assert.equal(config.slug, "cli_min");
  assert.equal(config.stampTarget, DEFAULT_STAMP_TARGET);
  assert.equal(config.rewardName, DEFAULT_REWARD_NAME);
  assert.equal(config.loyaltyEnabled, true);
});

test("clamps stamp targets the same way the Admin app does", () => {
  assert.equal(resolveStampTarget(0), DEFAULT_STAMP_TARGET);
  assert.equal(resolveStampTarget(99), DEFAULT_STAMP_TARGET);
  assert.equal(resolveStampTarget("12"), 12);
  assert.equal(resolveStampTarget(undefined, 7), 7);
  assert.equal(resolveStampTarget(3.5, 9), 9);
});

test("validates staffUsers records: active, inactive, missing client", () => {
  const active = validateStaffRecord({
    uid: "u1",
    clientId: "cli_bake01",
    name: "Amit",
    status: "ACTIVE",
    // A legacy tenant list cannot override the canonical clientId.
    clientIds: ["cli_other"],
  });
  assert.equal(active.ok, true);
  assert.equal(active.clientId, "cli_bake01");

  const inactive = validateStaffRecord({ uid: "u1", clientId: "cli_1", status: "INACTIVE" });
  assert.equal(inactive.ok, false);
  assert.equal(inactive.reason, "inactive");

  const disabledLower = validateStaffRecord({ uid: "u1", clientId: "cli_1", status: "disabled" });
  assert.equal(disabledLower.ok, false);

  const suspended = validateStaffRecord({ uid: "u1", clientId: "cli_1", status: "SUSPENDED" });
  assert.equal(suspended.ok, false);

  const inactiveFlag = validateStaffRecord({ uid: "u1", clientId: "cli_1", active: false });
  assert.equal(inactiveFlag.ok, false);

  const noClient = validateStaffRecord({ uid: "u1", name: "No Store", status: "ACTIVE" });
  assert.equal(noClient.ok, false);
  assert.equal(noClient.reason, "missingClientId");

  const nonStringClient = validateStaffRecord({ uid: "u1", clientId: 123, status: "ACTIVE" });
  assert.equal(nonStringClient.ok, false);
  assert.equal(nonStringClient.reason, "invalidClientId");

  const legacyList = validateStaffRecord({ uid: "u1", status: "ACTIVE", clientIds: ["cli_only"] });
  assert.equal(legacyList.ok, false);
  assert.equal(legacyList.reason, "missingClientId");
  assert.match(legacyList.notes.join(" "), /clientIds is ignored/);

  // Multiple legacy assignments never establish staff business identity.
  const multi = validateStaffRecord({ uid: "u1", clientIds: ["a", "b"], status: "ACTIVE" });
  assert.equal(multi.ok, false);
  assert.equal(multi.reason, "missingClientId");
});

test("builds the staff view model from the registry document", () => {
  const staff = buildStaffUser(
    "uid12345678",
    { name: "Amit", email: "amit@example.com", role: "STAFF", status: "ACTIVE", clientId: "cli_1" },
    { displayName: null, email: "fallback@example.com" }
  );
  assert.equal(staff.uid, "uid12345678");
  assert.equal(staff.name, "Amit");
  assert.equal(staff.email, "amit@example.com");
  assert.equal(staff.clientId, "cli_1");
});

test("loyalty balances belonging to another business are never surfaced", () => {
  const mine = resolveLoyaltyState("cust1", "cli_mine", {
    clientId: "cli_mine",
    customerId: "cust1",
    stamps: 4,
  });
  assert.equal(mine.belongsToClient, true);
  assert.equal(mine.stamps, 4);

  const foreign = resolveLoyaltyState("cust1", "cli_mine", {
    clientId: "cli_other",
    customerId: "cust1",
    stamps: 9,
  });
  assert.equal(foreign.belongsToClient, false);
  assert.equal(foreign.stamps, 0);

  const foreignCustomer = resolveLoyaltyState("cust1", "cli_mine", {
    clientId: "cli_mine",
    customerId: "cust2",
    stamps: 9,
  });
  assert.equal(foreignCustomer.belongsToClient, false);
  assert.equal(foreignCustomer.stamps, 0);
});

test("visit baseline mirrors the Security Rules oldVisits() reader", () => {
  // The rules only accept a non-negative integer totalVisits; anything else is
  // read as 0, so the client must compute the same baseline or the +1 check in
  // the rules rejects the whole write.
  assert.equal(visitBaseline(0), 0);
  assert.equal(visitBaseline(7), 7);
  assert.equal(visitBaseline(undefined), 0);
  assert.equal(visitBaseline(null), 0);
  assert.equal(visitBaseline("7"), 0);
  assert.equal(visitBaseline(-1), 0);
  assert.equal(visitBaseline(3.5), 0);
});

test("stamp retries replay either durable idempotency marker and increment exactly once", () => {
  const transactionId = "tx_stamp_one";
  assert.equal(stampVisitAlreadyApplied({ visitCounted: true }, {}, transactionId), true);
  assert.equal(
    stampVisitAlreadyApplied({ visitCounted: false }, { lastVisitTransactionId: transactionId }, transactionId),
    true
  );
  assert.equal(
    stampVisitAlreadyApplied({ visitCounted: false }, { lastVisitTransactionId: "other" }, transactionId),
    false
  );
  assert.equal(nextStampBalance(0), 1);
  assert.equal(nextStampBalance(7), 8);
  assert.equal(nextStampBalance("7"), 8);
});

test("reward eligibility and remaining balance match the redemption operation", () => {
  assert.equal(isRewardRedeemable(7, 8), false);
  assert.equal(isRewardRedeemable(8, 8), true);
  assert.equal(isRewardRedeemable(12, 8), true);
  assert.equal(remainingStampsAfterRedemption(8, 8), 0);
  assert.equal(remainingStampsAfterRedemption(12, 8), 4);
});

test("stamp ledger rows are distinguished from pending visits and reward redemptions", () => {
  assert.equal(isStampLedgerEntry({ type: "STAMP_ADDED", delta: 1, visitCounted: false }), false);
  assert.equal(isStampLedgerEntry({ type: "STAMP_ADDED", delta: 1, visitCounted: true }), true);
  assert.equal(isStampLedgerEntry({ type: "STAMP_ADDED", delta: 1 }), true);
  assert.equal(isStampLedgerEntry({ delta: 1 }), true);
  assert.equal(isStampLedgerEntry({}), true);
  assert.equal(isStampLedgerEntry({ type: "REWARD_REDEEMED", delta: -8 }), false);
  assert.equal(isStampLedgerEntry({ delta: -8 }), false);
  assert.equal(isStampLedgerEntry({ type: "REWARD_REDEEMED" }), false);
});
