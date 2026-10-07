/** Canonical staff authorization and listener-readiness contract tests. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isClientReadySession } from "../src/services/staffSession.ts";

const readySession = {
  uid: "firebase-uid-1",
  clientId: "cli_bake",
  staffRecord: { clientId: "cli_bake" },
  clientRecord: { clientId: "cli_bake" },
};

test("staffUsers resolution is the only business identity and must match Auth UID", () => {
  assert.equal(isClientReadySession(readySession, "firebase-uid-1"), true);
  assert.equal(isClientReadySession(readySession, "different-auth-uid"), false);
  assert.equal(isClientReadySession({ ...readySession, clientId: "" }, "firebase-uid-1"), false);
  assert.equal(isClientReadySession({ ...readySession, clientId: undefined }, "firebase-uid-1"), false);
  assert.equal(
    isClientReadySession({ ...readySession, staffRecord: { clientId: "cli_other" } }, "firebase-uid-1"),
    false
  );
  assert.equal(
    isClientReadySession({ ...readySession, clientRecord: { clientId: "cli_other" } }, "firebase-uid-1"),
    false
  );
});

test("notification listener cannot start before a ready session and is always unsubscribed", () => {
  const service = readFileSync(new URL("../src/services/firebaseService.ts", import.meta.url), "utf8");
  const header = readFileSync(new URL("../src/components/StaffHeader.tsx", import.meta.url), "utf8");
  assert.match(service, /static listenToNotifications\([\s\S]*?return this\.withSession\(/);
  assert.match(service, /if \(!isClientReadySession\(session, authenticatedUid\)\)[\s\S]*?refusing to start a business listener before CLIENT_READY/);
  assert.match(service, /return \(\) => \{\s*cancelled = true;\s*unsubscribe\(\);/);
  assert.match(header, /status !== "authorized" \|\| !session\?\.uid \|\| !clientId/);
  assert.match(header, /return \(\) => \{\s*active = false;\s*unsubscribe\(\);/);
});
