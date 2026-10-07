import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAMP_COOLDOWN_MS,
  formatCooldownRemaining,
  getStampCooldownState,
  reconcileLifetimeStamps,
} from "../src/services/stampPolicy.ts";

test("normal stamp policy is ineligible until exactly twelve hours have elapsed", () => {
  const lastStamp = 1_800_000_000_000;
  assert.equal(STAMP_COOLDOWN_MS, 12 * 60 * 60 * 1000);
  assert.deepEqual(getStampCooldownState(lastStamp, lastStamp + STAMP_COOLDOWN_MS - 1), {
    eligible: false,
    nextStampAtMillis: lastStamp + STAMP_COOLDOWN_MS,
    remainingMs: 1,
  });
  assert.deepEqual(getStampCooldownState(lastStamp, lastStamp + STAMP_COOLDOWN_MS), {
    eligible: true,
    nextStampAtMillis: lastStamp + STAMP_COOLDOWN_MS,
    remainingMs: 0,
  });
  assert.equal(getStampCooldownState(undefined, lastStamp).eligible, true);
});

test("cooldown copy is compact and rounds remaining time up", () => {
  assert.equal(formatCooldownRemaining(1), "1m");
  assert.equal(formatCooldownRemaining(60 * 60 * 1000 + 1), "1h 1m");
  assert.equal(formatCooldownRemaining(2 * 60 * 60 * 1000), "2h");
});

test("lifetime reconciliation never resets history and uses valid ledger lower bounds", () => {
  assert.equal(reconcileLifetimeStamps(2, 0, 2), 2);
  assert.equal(reconcileLifetimeStamps(3, 9, 7), 9);
  assert.equal(reconcileLifetimeStamps(3, undefined, 12), 12);
  assert.equal(reconcileLifetimeStamps(3, -1, undefined), 3);
});
