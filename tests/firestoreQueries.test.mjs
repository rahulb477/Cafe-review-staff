/**
 * Query-contract tests for the actual Firestore SDK queries used by the Staff
 * App. These compare production builders with the exact expected constraints;
 * they do not contact production Firestore.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { deleteApp, initializeApp } from "firebase/app";
import {
  collection,
  documentId,
  getFirestore,
  limit,
  orderBy,
  query,
  queryEqual,
  terminate,
  where,
} from "firebase/firestore";
import {
  buildCustomerDirectoryQuery,
  buildCustomerExactSearchQueries,
  buildCustomerNamePrefixQuery,
  buildNotificationsListenerQuery,
  buildTodayCustomersCountQuery,
} from "../src/services/firestoreQueries.ts";

const app = initializeApp({ projectId: "demo-staff-query-contracts", apiKey: "contract-test-key" }, "query-contracts");
const db = getFirestore(app);

after(async () => {
  await terminate(db);
  await deleteApp(app);
});

test("notification listener query is exactly scoped, ordered and limited", () => {
  const actual = buildNotificationsListenerQuery(db, "cli_bake", 20);
  const expected = query(
    collection(db, "clients", "cli_bake", "notifications"),
    orderBy("createdAt", "desc"),
    limit(20)
  );
  assert.equal(queryEqual(actual, expected), true);
});

test("customer directory query always contains the canonical clientId equality", () => {
  const actual = buildCustomerDirectoryQuery(db, "cli_bake", 30);
  const expected = query(
    collection(db, "customers"),
    where("clientId", "==", "cli_bake"),
    limit(30)
  );
  assert.equal(queryEqual(actual, expected), true);
});

test("every exact customer search query is client-scoped, including document ID and phone", () => {
  const candidates = buildCustomerExactSearchQueries(db, "cli_bake", "+91 98765 43210", 25);
  assert.deepEqual(candidates.map(({ kind }) => kind), [
    "documentId",
    "uid",
    "code",
    "customerCode",
    "normalizedPhone",
    "phone",
    "phoneIndexId",
  ]);

  const phone = "+919876543210";
  const phoneIndexId = "cli_bake_9876543210";
  const expected = [
    query(collection(db, "customers"), where("clientId", "==", "cli_bake"), where(documentId(), "==", "+91 98765 43210"), limit(25)),
    query(collection(db, "customers"), where("clientId", "==", "cli_bake"), where("uid", "==", "+91 98765 43210"), limit(25)),
    query(collection(db, "customers"), where("clientId", "==", "cli_bake"), where("code", "==", "+91 98765 43210"), limit(25)),
    query(collection(db, "customers"), where("clientId", "==", "cli_bake"), where("customerCode", "==", "+91 98765 43210"), limit(25)),
    query(collection(db, "customers"), where("clientId", "==", "cli_bake"), where("normalizedPhone", "==", phone), limit(25)),
    query(collection(db, "customers"), where("clientId", "==", "cli_bake"), where("phone", "==", phone), limit(25)),
    query(collection(db, "customers"), where("clientId", "==", "cli_bake"), where("phoneIndexId", "==", phoneIndexId), limit(25)),
  ];
  candidates.forEach((candidate, index) => assert.equal(queryEqual(candidate.query, expected[index]), true, candidate.kind));
});

test("name prefix query preserves client scope and uses the declared name ordering", () => {
  const actual = buildCustomerNamePrefixQuery(db, "cli_bake", "Goku", 25);
  const expected = query(
    collection(db, "customers"),
    where("clientId", "==", "cli_bake"),
    where("name", ">=", "goku"),
    where("name", "<=", `goku\uf8ff`),
    orderBy("name", "asc"),
    limit(25)
  );
  assert.equal(queryEqual(actual, expected), true);
});

test("dashboard customer count uses the exact clientId + createdAt ASC index query", () => {
  const start = new Date("2026-10-06T00:00:00.000Z");
  const end = new Date("2026-10-07T00:00:00.000Z");
  const actual = buildTodayCustomersCountQuery(db, "cli_bake", start);
  const expected = query(
    collection(db, "customers"),
    where("clientId", "==", "cli_bake"),
    where("createdAt", ">=", start),
    where("createdAt", "<", end),
    orderBy("createdAt", "asc")
  );
  assert.equal(queryEqual(actual, expected), true);
});

test("all customer query builders reject an unresolved/empty business id", () => {
  assert.throws(() => buildCustomerDirectoryQuery(db, "", 30));
  assert.throws(() => buildNotificationsListenerQuery(db, "", 20));
  assert.throws(() => buildCustomerNamePrefixQuery(db, "", "name", 25));
});
