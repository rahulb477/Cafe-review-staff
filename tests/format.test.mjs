/**
 * Presentation formatter tests.
 *
 * These guard the copy the redesign depends on: the dashboard greeting, the
 * relative "2 mins ago" line in Customer Lookup, the "3 / 8" stamp fraction
 * and the "5 more stamps for Free Coffee" milestone line. They also assert the
 * honesty rules — missing data must never be rendered as a fake value.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avatarTintFor,
  formatDayLabel,
  greetingForHour,
  initialOf,
  loyaltyProgressPercent,
  relativeTime,
  relativeTimeFromMillis,
  stampFraction,
  stampsRemainingCopy,
} from "../src/lib/format.ts";

const NOW = Date.parse("2026-10-06T12:00:00.000Z");

test("greeting follows the time of day", () => {
  assert.equal(greetingForHour(4), "Good night");
  assert.equal(greetingForHour(6), "Good morning");
  assert.equal(greetingForHour(11), "Good morning");
  assert.equal(greetingForHour(13), "Good afternoon");
  assert.equal(greetingForHour(18), "Good evening");
  assert.equal(greetingForHour(22), "Good night");
});

test("the dashboard date line is a readable long label", () => {
  const label = formatDayLabel(new Date(NOW));
  assert.match(label, /Oct/);
  assert.match(label, /2026|6/);
});

test("relative time matches the reference copy", () => {
  assert.equal(relativeTimeFromMillis(NOW - 20_000, NOW), "Just now");
  assert.equal(relativeTimeFromMillis(NOW - 2 * 60_000, NOW), "2 mins ago");
  assert.equal(relativeTimeFromMillis(NOW - 60_000, NOW), "1 min ago");
  assert.equal(relativeTimeFromMillis(NOW - 15 * 60_000, NOW), "15 mins ago");
  assert.equal(relativeTimeFromMillis(NOW - 60 * 60_000, NOW), "1 hour ago");
  assert.equal(relativeTimeFromMillis(NOW - 5 * 60 * 60_000, NOW), "5 hours ago");
  assert.equal(relativeTimeFromMillis(NOW - 26 * 60 * 60_000, NOW), "Yesterday");
  assert.equal(relativeTimeFromMillis(NOW - 4 * 24 * 60 * 60_000, NOW), "4 days ago");
});

test("missing or invalid timestamps never render a fake 'just now'", () => {
  assert.equal(relativeTimeFromMillis(undefined, NOW), undefined);
  assert.equal(relativeTimeFromMillis(Number.NaN, NOW), undefined);
  assert.equal(relativeTime(undefined, NOW), undefined);
  assert.equal(relativeTime("not-a-date", NOW), undefined);
});

test("an ISO timestamp is accepted by relativeTime", () => {
  assert.equal(relativeTime(new Date(NOW - 3 * 60_000).toISOString(), NOW), "3 mins ago");
});

test("a timestamp in the future (clock skew) is still honest", () => {
  assert.equal(relativeTimeFromMillis(NOW + 10_000, NOW), "Just now");
  assert.ok(relativeTimeFromMillis(NOW + 3 * 60 * 60_000, NOW));
});

test("the stamp fraction is always 'n / target'", () => {
  assert.equal(stampFraction(3, 8), "3 / 8");
  assert.equal(stampFraction(8, 8), "8 / 8");
  assert.equal(stampFraction(0, 8), "0 / 8");
});

test("the stamp fraction never renders a negative or fractional count", () => {
  assert.equal(stampFraction(-4, 8), "0 / 8");
  assert.equal(stampFraction(3.7, 8), "3 / 8");
  assert.equal(stampFraction(3, 0), "3 / 0");
});

test("the milestone line pluralises correctly", () => {
  assert.equal(stampsRemainingCopy(3, 8, "Free Coffee"), "5 more stamps for Free Coffee");
  assert.equal(stampsRemainingCopy(7, 8, "Free Coffee"), "1 more stamp for Free Coffee");
  assert.equal(stampsRemainingCopy(8, 8, "Free Coffee"), "Free Coffee is ready to redeem");
  assert.equal(stampsRemainingCopy(9, 8, "Free Coffee"), "Free Coffee is ready to redeem");
});

test("loyalty progress is clamped to 0–100", () => {
  assert.equal(loyaltyProgressPercent(0, 8), 0);
  assert.equal(loyaltyProgressPercent(4, 8), 50);
  assert.equal(loyaltyProgressPercent(8, 8), 100);
  assert.equal(loyaltyProgressPercent(12, 8), 100);
  assert.equal(loyaltyProgressPercent(4, 0), 0);
});

test("the avatar initial is uppercase and never empty", () => {
  assert.equal(initialOf("priya"), "P");
  assert.equal(initialOf(""), "C");
  assert.equal(initialOf(undefined), "C");
});

test("avatar tints are deterministic and always from the warm palette", () => {
  const first = avatarTintFor("customer-1");
  assert.equal(first, avatarTintFor("customer-1"));
  assert.match(first, /^#[0-9a-f]{6}$/);
  assert.equal(avatarTintFor(undefined), "#f0e2cf");
});
