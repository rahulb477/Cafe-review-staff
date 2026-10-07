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
  assert.match(service, /static async addStamp\([\s\S]*?runTransaction\(firestore/);
  assert.match(service, /transaction\.set\(transactionRef,[\s\S]*?type: "STAMP_ADDED"/);
  assert.match(service, /transaction\.set\(\s*loyaltyRef,[\s\S]*?currentStamps: newStamps/);
  assert.doesNotMatch(service, /applyStampVisit\(visitArgs, \{ markCounted: false \}\)/);
  const block = rules.match(/match \/stampTransactions\/\{transactionId\} \{([\s\S]*?)\n      \}/)?.[1];
  assert.ok(block);
  assert.match(block, /request\.resource\.data\.staffId == uid\(\)/);
  assert.match(block, /request\.resource\.data\.staffUid == uid\(\)/);
});

test("normal stamps are cooldown-enforced by Firestore server time and have no recursive admin bypass", () => {
  assert.match(rules, /function stampCooldownHasElapsed\(customerId\)[\s\S]*?request\.time >= lastStampAt \+ duration\.value\(12, 'h'\)/);
  assert.match(rules, /stampCooldownHasElapsed\(request\.resource\.data\.customerId\)/);
  assert.match(rules, /lastVisitAt is timestamp[\s\S]*?request\.time >= lastVisitAt \+ duration\.value\(12, 'h'\)/);
  assert.match(rules, /customerData\.get\('totalVisits', -1\) == 0/);
  assert.match(service, /static async addStamp\([\s\S]*?runTransaction\(firestore/);
  assert.match(service, /stampCooldownErrorAfterDeniedWrite/);
  assert.match(service, /StampCooldownError/);
  assert.match(service, /transaction\.set\(stampNotificationRef/);
  assert.match(service, /transaction\.set\(rewardNotificationRef/);
  assert.match(service, /lastVisitAt: serverTimestamp\(\)/);
  assert.match(service, /currentStamps: newStamps/);
  assert.match(service, /const stampTarget = clientConfig\.stampTarget/);
  assert.match(rules, /request\.resource\.data\.stampTarget == configuredClientStampTarget\(clientId\)/);
  assert.match(rules, /function configuredClientRewardName\(clientId\)[\s\S]*?'Free Coffee'/);
  assert.match(rules, /request\.resource\.data\.rewardName == configuredClientRewardName\(clientId\)/);
  assert.match(service, /rewardName,\n\s+description: customerCode/);
  assert.doesNotMatch(service, /Date\.now\(\)[\s\S]{0,80}eligible/);

  const recursiveAdmin = rules.match(/match \/\{document=\*\*\} \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(recursiveAdmin);
  assert.match(recursiveAdmin, /allow read: if isActiveAdmin\(\)/);
  assert.doesNotMatch(recursiveAdmin, /allow [^;]*write/);
});

test("phone uniqueness keys are scoped per business, and scanner authorization ignores QR tenant hints", () => {
  assert.match(rules, /function phoneKey\(clientId, phone\)[\s\S]*?return clientId \+ '_' \+ phone\[1:\]/);
  assert.match(rules, /phoneIndexId\s*==\s*phoneKey\(\s*d\(\)\.clientId/);
  assert.match(service, /tokenClientId\.toLowerCase\(\) !== clientId\.toLowerCase\(\)/);
  assert.match(service, /payload\.allowCustomerIdFallback/);
  assert.match(service, /loadCustomerById\(tokenCustomerId, clientId/);
  assert.match(service, /slug hint: purely diagnostic, NEVER authorization/i);
});

test("customer codes are never synthesized from customer document ids", () => {
  assert.match(service, /customerCode = firstString\([\s\S]*?customerData\.customerCode,[\s\S]*?customerData\.code,[\s\S]*?customerData\.displayId/);
  assert.doesNotMatch(service, /customerCode[^;\n]*substring\(0,\s*6\)/);
  assert.match(service, /lastActivityMillis: lastVisitAtMillis/);
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
  assert.match(block, /request\.resource\.data\.currentStamps == loyaltyStampBaseline\(\) \+ 1/);
  assert.match(block, /request\.resource\.data\.stamps == request\.resource\.data\.currentStamps/);
  assert.match(block, /request\.resource\.data\.lifetimeStamps >= loyaltyLifetimeBaseline\(\)/);
  assert.match(block, /lastRewardRedemptionId/);
  assert.match(rules, /getAfter\([\s\S]*?\.data\.get\('lastRewardRedemptionId', ''\) == redemptionId/);
  assert.match(service, /lastRewardRedemptionId: redemptionId/);
});

test("pending stamp ledger rows cannot be presented as counted activity or dashboard stamps", () => {
  const clientConfig = read("src/services/clientConfig.ts");
  assert.match(clientConfig, /record\.visitCounted === undefined \|\| record\.visitCounted === true/);
  assert.match(service, /if \(!isReward && !isStampLedgerEntry\(data\)\) return null/);
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

test("customer reconciliation is a reviewed dry run and never merges/deletes identities", () => {
  const reconciliation = read("scripts/reconcile-customer-data.mjs");
  assert.match(reconciliation, /const applyCounters = args\.includes\("--apply-counters"\)/);
  assert.match(reconciliation, /destructiveCustomerMergeOrDelete: false/);
  assert.match(reconciliation, /manual-review-only/);
  assert.match(reconciliation, /if \(applyCounters && confirmProject !== PROJECT_ID\)/);
  assert.doesNotMatch(reconciliation, /\.delete\s*\(|\.set\s*\([^\n]*merge/i);
  assert.doesNotMatch(reconciliation, /customerRef\.delete|loyaltyRef\.delete/);
  assert.match(reconciliation, /same-name matches are not automatically merged/);
  assert.match(read("package.json"), /"reconcile:customers": "node scripts\/reconcile-customer-data\.mjs"/);
});

test("notification, stamp and reward data never use top-level legacy ledger paths", () => {
  assert.doesNotMatch(service, /collection\(firestore, ["']stampTransactions["']/);
  assert.doesNotMatch(service, /collection\(firestore, ["']rewardRedemptions["']/);
  assert.match(service, /SUBCOLLECTIONS\.notifications/);
  assert.match(service, /markNotificationRead/);
  assert.doesNotMatch(rules, /allow\s+(?:read|write|read,\s*write):\s*if\s+true/);
});
