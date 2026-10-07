/**
 * Customer QR parsing regression tests.
 *
 * The canonical Customer App pass is an APP URL with an opaque `ct` token:
 *   https://<customer-app>/<slug>?ct=<64-hex token>
 * The Staff App used to treat the whole URL as a document id, which made every
 * scan fail with "customer not found".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOMER_TOKEN_RE,
  looksLikeNonCustomerQr,
  parseCustomerQrPayload,
} from "../src/services/qrPayload.ts";

const TOKEN = "a".repeat(64);
const OTHER_TOKEN = "0123456789abcdef".repeat(4);

test("parses the canonical customer pass URL (slug + ct token)", () => {
  const result = parseCustomerQrPayload(`https://app.grounds.example/bake?ct=${TOKEN}`);
  assert.equal(result.ok, true);
  assert.equal(result.payload.token, TOKEN);
  assert.equal(result.payload.canonicalToken, true);
  assert.equal(result.payload.source, "url");
  assert.equal(result.payload.clientSlugHint, "bake");
  assert.equal(result.payload.allowCustomerIdFallback, false);
});

test("parses a URL without scheme and with extra query params", () => {
  const result = parseCustomerQrPayload(`cafe-review7.web.app/sharma-cafe?table=4&ct=${OTHER_TOKEN}`);
  assert.equal(result.ok, true);
  assert.equal(result.payload.token, OTHER_TOKEN);
  assert.equal(result.payload.clientSlugHint, "sharma-cafe");
  assert.equal(CUSTOMER_TOKEN_RE.test(result.payload.token), true);
});

test("malformed percent escapes in the untrusted URL slug do not break token parsing", () => {
  const result = parseCustomerQrPayload(`https://app.example/bake%ZZ?ct=${TOKEN}`);
  assert.equal(result.ok, true);
  assert.equal(result.payload.token, TOKEN);
  assert.equal(result.payload.clientSlugHint, "bake%ZZ");
});

test("parses a raw 64-hex token", () => {
  const result = parseCustomerQrPayload(TOKEN);
  assert.equal(result.ok, true);
  assert.equal(result.payload.token, TOKEN);
  assert.equal(result.payload.canonicalToken, true);
  assert.equal(result.payload.source, "raw");
});

test("parses a JSON payload produced by older passes", () => {
  const result = parseCustomerQrPayload(JSON.stringify({ token: TOKEN, slug: "bake" }));
  assert.equal(result.ok, true);
  assert.equal(result.payload.token, TOKEN);
  assert.equal(result.payload.source, "json");
  assert.equal(result.payload.clientSlugHint, "bake");
});

test("legacy opaque ids stay resolvable but are flagged for the fallback path", () => {
  const result = parseCustomerQrPayload("cust_9F3KQZ12");
  assert.equal(result.ok, true);
  assert.equal(result.payload.canonicalToken, false);
  assert.equal(result.payload.allowCustomerIdFallback, true);
});

test("rejects non-customer payloads without any Firestore lookup", () => {
  assert.equal(parseCustomerQrPayload("").ok, false);
  assert.equal(parseCustomerQrPayload("   ").ok, false);
  assert.equal(parseCustomerQrPayload("https://app.example/bake").ok, false); // no ct param
  assert.equal(parseCustomerQrPayload("not a qr!!").ok, false);
  assert.equal(parseCustomerQrPayload("?ct=short").ok, false);
  assert.equal(parseCustomerQrPayload("{}").ok, false);
});

test("never trusts a clientId or URL tenant embedded in the payload", () => {
  const result = parseCustomerQrPayload(
    `https://app.example/royal-restaurant?clientId=cli_attacker&ct=${TOKEN}`
  );
  assert.equal(result.ok, true);
  assert.equal(result.payload.token, TOKEN);
  // The parsed payload carries no clientId field at all — only the slug hint.
  assert.equal("clientId" in result.payload, false);
  assert.equal(result.payload.clientSlugHint, "royal-restaurant");
});

test("flags clearly non-customer QR payloads", () => {
  assert.equal(looksLikeNonCustomerQr("https://app.example/staff/login"), true);
  assert.equal(looksLikeNonCustomerQr("https://app.example/bake/menu"), true);
  assert.equal(looksLikeNonCustomerQr(`https://app.example/bake?ct=${TOKEN}`), false);
});
