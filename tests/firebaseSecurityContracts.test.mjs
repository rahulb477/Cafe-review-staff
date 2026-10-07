/** Static contracts for rules/deploy wiring and the service's canonical paths. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");
const rules = read("firestore.rules");
const service = read("src/services/firebaseService.ts");
const paths = read("src/services/firestorePaths.ts");

test("Firebase deploy wiring points at the canonical rules and indexes", () => {
  const config = JSON.parse(read("firebase.json"));
  const aliases = JSON.parse(read(".firebaserc"));
  assert.equal(config.firestore.rules, "firestore.rules");
  assert.equal(config.firestore.indexes, "firestore.indexes.json");
  assert.equal(aliases.projects.default, "cafe-review7");
  assert.match(rules, /Security Rules for project `cafe-review7`/);
});

test("staff business identity is the authenticated UID's staffUsers.clientId only", () => {
  assert.match(rules, /function staffClientId\(\)[\s\S]*?get\([\s\S]*?staffUsers\/\$\(uid\(\)\)[\s\S]*?\.data\.get\('clientId', ''\)/);
  assert.match(rules, /function isStaffOf\(clientId\)[\s\S]*?staffClientId\(\) == clientId/);
  assert.doesNotMatch(rules.match(/function staffClientId\(\)[\s\S]*?\n    }/)?.[0] ?? "", /clientIds/);
  assert.doesNotMatch(service, /localStorage\.|sessionStorage\.|useSearchParams/);
  assert.match(service, /doc\(firestore, COLLECTIONS\.staffUsers, user\.uid\)/);
});

test("notification rule grants only the assigned client and allows only read mutation", () => {
  const block = rules.match(/match \/notifications\/\{notificationId\} \{([\s\S]*?)\n      \}/)?.[1];
  assert.ok(block, "nested clients/{clientId}/notifications/{notificationId} rule exists");
  assert.match(block, /allow read:\s*if isStaffOf\(clientId\)/);
  assert.match(block, /allow create:[\s\S]*?isStaffOf\(clientId\)/);
  assert.match(block, /request\.resource\.data\.get\('staffUid', ''\) == uid\(\)/);
  assert.match(block, /affectedKeys\(\)\.hasOnly\(\['read'\]\)/);
  assert.match(block, /allow delete: if false/);
  assert.match(service, /buildNotificationsListenerQuery\([\s\S]*?session\.clientId/);
  assert.match(service, /orderBy: "createdAt desc"/);
  assert.match(service, /limit: NOTIFICATION_LIMIT/);
  assert.match(paths, /notificationsPath = \(clientId: string\) =>[\s\S]*?clientPath\(clientId\)[\s\S]*?SUBCOLLECTIONS\.notifications/);
  assert.doesNotMatch(rules, /^    match \/notifications\/\{[^}]+\}/m);
});

test("customer rules preserve owner profile access and constrain staff list/visit writes", () => {
  const block = rules.match(/match \/customers\/\{customerId\} \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(block, "canonical customers/{customerId} rules exist");
  assert.match(block, /allow get:[\s\S]*?uid\(\) == customerId/);
  assert.match(block, /allow list:[\s\S]*?resource\.data\.clientId == staffClientId\(\)/);
  assert.match(block, /allow update:[\s\S]*?uid\(\) == customerId[\s\S]*?changed\(\)\.hasOnly\([\s\S]*?'name'[\s\S]*?'phone'[\s\S]*?'email'/);
  assert.match(block, /changed\(\)\.hasOnly\([\s\S]*?'totalVisits'[\s\S]*?'lastVisitAt'[\s\S]*?'lastVisitTransactionId'/);
  assert.match(block, /getAfter\([\s\S]*?\)\.data\.get\([\s\S]*?'visitCounted'[\s\S]*?\) == true/);
});

test("stamp writes use the business subcollection and authenticated staff UID", () => {
  assert.match(paths, /stampTransactionsPath = \(clientId: string\) =>\s*`\$\{clientPath\(clientId\)\}\/\$\{SUBCOLLECTIONS\.stampTransactions\}`/);
  assert.match(service, /doc\(\s*firestore,\s*COLLECTIONS\.clients,\s*clientId,\s*SUBCOLLECTIONS\.stampTransactions,\s*transactionId\s*\)/);
  assert.match(service, /staffId: session\.uid,[\s\S]*?staffUid: session\.uid/);
  assert.match(service, /visitCounted: false/);
  assert.match(service, /visitCounted:\s*true,[\s\S]{0,180}visitCountedAt:\s*serverTimestamp\(\)/);
  assert.match(service, /lastVisitTransactionId: transactionId/);
  assert.match(service, /stampVisitAlreadyApplied\(/);
  assert.doesNotMatch(service, /applyStampVisit\(visitArgs, \{ markCounted: false \}\)/);
  const block = rules.match(/match \/stampTransactions\/\{transactionId\} \{([\s\S]*?)\n      \}/)?.[1];
  assert.ok(block);
  assert.match(block, /request\.resource\.data\.staffId == uid\(\)/);
  assert.match(block, /request\.resource\.data\.staffUid == uid\(\)/);
});

test("reward redemption is nested, same-business, authenticated and create-only", () => {
  assert.match(paths, /rewardRedemptionsPath = \(clientId: string\) =>\s*`\$\{clientPath\(clientId\)\}\/\$\{SUBCOLLECTIONS\.rewardRedemptions\}`/);
  assert.match(service, /COLLECTIONS\.clients,\s*clientId,\s*SUBCOLLECTIONS\.rewardRedemptions,\s*redemptionId/);
  assert.match(service, /staffUid: session\.uid,[\s\S]*?staffId: session\.uid/);
  assert.match(service, /assertClientOwnership\([\s\S]*?customerData\.clientId,[\s\S]*?customerPath\(cleanCustomerId\)/);
  assert.match(service, /if \(redemptionSnap\.exists\(\)\)/);
  const block = rules.match(/match \/rewardRedemptions\/\{redemptionId\} \{([\s\S]*?)\n      \}/)?.[1];
  assert.ok(block);
  assert.match(block, /request\.resource\.data\.staffUid == uid\(\)/);
  assert.match(block, /request\.resource\.data\.staffId == uid\(\)/);
  assert.match(block, /customers\/\$\(request\.resource\.data\.customerId\)/);
  assert.match(block, /loyaltyAccounts\/\$\(request\.resource\.data\.customerId\)/);
  assert.match(block, /effectiveStampTarget\(/);
  assert.match(block, /allow update, delete: if false/);
});

test("customer query composites cover the count, prefix, and exact search constraints", () => {
  const indexes = JSON.parse(read("firestore.indexes.json"));
  const hasIndex = (fieldPairs) => indexes.indexes.some((index) =>
    index.collectionGroup === "customers" &&
    index.queryScope === "COLLECTION" &&
    JSON.stringify(index.fields) === JSON.stringify(fieldPairs.map(([fieldPath, order]) => ({ fieldPath, order })))
  );
  for (const field of ["name", "createdAt", "uid", "code", "customerCode", "normalizedPhone", "phone", "phoneIndexId"]) {
    assert.equal(hasIndex([["clientId", "ASCENDING"], [field, "ASCENDING"]]), true, `${field} index`);
  }
  // clientId + __name__ is an equality-only composite that duplicates what
  // Firestore's automatic single-field index + document-id ordering already
  // provides; the Firestore API rejects it as unnecessary, so it must never
  // be declared explicitly (the documentId() exact-search query above still
  // works without any composite index for this field).
  assert.equal(hasIndex([["clientId", "ASCENDING"], ["__name__", "ASCENDING"]]), false, "unnecessary __name__ composite index");
  assert.match(service, /buildTodayCustomersCountQuery\(firestore, clientId, startOfToday\)/);
  assert.match(service, /index: "customers: clientId ASC, createdAt ASC"/);
  assert.deepEqual(indexes.fieldOverrides, []);
});

test("loyalty writes are tied to a counted stamp or atomic create-only reward redemption", () => {
  const block = rules.match(/match \/loyaltyAccounts\/\{customerId\} \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(block);
  assert.match(block, /validStampAccountMutation\(request\.resource\.data\.clientId\)/);
  assert.match(block, /matchingRewardMutation\(/);
  assert.match(block, /request\.resource\.data\.stamps == loyaltyStampBaseline\(\) \+ 1/);
  assert.match(block, /lastRewardRedemptionId/);
  assert.match(rules, /getAfter\([\s\S]*?\.data\.get\('lastRewardRedemptionId', ''\) == redemptionId/);
  assert.match(service, /lastRewardRedemptionId: redemptionId/);
});

test("pending stamp ledger rows cannot be presented as counted activity or dashboard stamps", () => {
  const clientConfig = read("src/services/clientConfig.ts");
  assert.match(clientConfig, /record\.visitCounted !== false/);
  assert.match(service, /data\.type === "STAMP_ADDED" && data\.visitCounted === false\) return null/);
  assert.match(service, /stampCountBefore: previousStamps,[\s\S]*?stampCountAfter: newStamps/);
});

test("unavailable dashboard metrics render as unavailable, never as fabricated zeros", () => {
  const dashboard = read("src/app/staff/[clientSlug]/page.tsx");
  assert.match(dashboard, /stats\.customersAvailable && stats\.todayCustomers !== null[\s\S]*?: "—"/);
  assert.match(dashboard, /stats\.stampsAvailable \? stats\.todayStamps : "—"/);
  assert.match(dashboard, /stats\.reviewsAvailable \? stats\.todayReviews : "—"/);
  assert.match(dashboard, /stats\.rewardsAvailable \? stats\.rewardsRedeemed : "—"/);
  assert.doesNotMatch(service, /reviews = 0;\s*reviewsAvailable = false/);
});

test("notification, stamp and reward data never use top-level legacy ledger paths", () => {
  assert.doesNotMatch(service, /collection\(firestore, ["']stampTransactions["']/);
  assert.doesNotMatch(service, /collection\(firestore, ["']rewardRedemptions["']/);
  assert.match(service, /SUBCOLLECTIONS\.notifications/);
  assert.match(service, /markNotificationRead/);
  assert.doesNotMatch(rules, /allow\s+(?:read|write|read,\s*write):\s*if\s+true/);
});
