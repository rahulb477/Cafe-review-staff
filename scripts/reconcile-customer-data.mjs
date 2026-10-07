#!/usr/bin/env node
/**
 * Read-only-by-default reconciliation report for cafe-review7.
 *
 * Reports same-business phone collisions and proposes monotonic counter repairs
 * from canonical stamp/reward ledgers. It never merges or deletes customers.
 * Counter writes require the explicit --apply-counters and project confirmation
 * flags; do not run that mode while staff are stamping/redeeming.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";

const PAGE_SIZE = 500;
const PROJECT_ID = "cafe-review7";
const configuredProjectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
const args = process.argv.slice(2);
const applyCounters = args.includes("--apply-counters");
const confirmProject = args.find((arg) => arg.startsWith("--confirm-project="))?.split("=")[1];
const outputArgIndex = args.indexOf("--output");
const outputPath = outputArgIndex >= 0 ? args[outputArgIndex + 1] : undefined;
const help = args.includes("--help") || args.includes("-h");

if (help) {
  console.log(`Usage: npm run reconcile:customers [--output report.json]\n\n` +
    `Default: dry-run only; reads cafe-review7 and prints a reconciliation report.\n` +
    `Optional: --apply-counters --confirm-project=cafe-review7 writes only monotonic\n` +
    `counter repairs. Customer records are never merged or deleted.`);
  process.exit(0);
}
if (configuredProjectId && configuredProjectId !== PROJECT_ID) {
  throw new Error(`Refusing to read or write ${configuredProjectId}; this tool is pinned to ${PROJECT_ID}.`);
}

const allowedArgs = new Set(["--apply-counters", "--help", "-h", "--output"]);
for (const arg of args) {
  if (arg.startsWith("--confirm-project=")) continue;
  if (allowedArgs.has(arg)) continue;
  if (outputArgIndex >= 0 && arg === args[outputArgIndex + 1]) continue;
  throw new Error(`Unknown argument: ${arg}`);
}
if (outputArgIndex >= 0 && !outputPath) throw new Error("--output requires a file path");
if (applyCounters && confirmProject !== PROJECT_ID) {
  throw new Error(`Counter writes require --confirm-project=${PROJECT_ID}.`);
}
if (!applyCounters && confirmProject) {
  throw new Error("--confirm-project is only valid with --apply-counters.");
}

const app = getApps()[0] ?? initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});
const db = getFirestore(app);

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInt(value) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function optionalNonNegativeInt(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

function timestampToMillis(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  if (typeof value.toMillis === "function") {
    try {
      const parsed = value.toMillis();
      if (Number.isFinite(parsed)) return parsed;
    } catch {
      // Fall through to serialized seconds fields.
    }
  }
  const seconds = value.seconds ?? value._seconds;
  const nanos = value.nanoseconds ?? value._nanoseconds ?? 0;
  if (typeof seconds !== "number" || !Number.isInteger(seconds)) return undefined;
  if (typeof nanos !== "number" || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1_000_000_000) {
    return undefined;
  }
  return seconds * 1000 + nanos / 1_000_000;
}

function normalizePhone(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  let normalized;
  if (digits.length === 10) normalized = `+91${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) normalized = `+91${digits.slice(1)}`;
  else if (digits.length === 12 && digits.startsWith("91")) normalized = `+${digits}`;
  else if (digits.length === 13 && digits.startsWith("091")) normalized = `+${digits.slice(1)}`;
  else return undefined;
  return /^\+91[6-9]\d{9}$/.test(normalized) ? normalized : undefined;
}

function maskPhone(phone) {
  return phone ? `${phone.slice(0, 3)}•••••${phone.slice(-4)}` : "unavailable";
}

function normalizeName(value) {
  return asString(value).normalize("NFKC").toLocaleLowerCase("en-IN").replace(/\s+/g, " ");
}

function isFirestoreTimestamp(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.toMillis === "function" &&
    timestampToMillis(value) !== undefined
  );
}

async function readAll(collectionRef) {
  const rows = [];
  let cursor;
  while (true) {
    let pageQuery = collectionRef.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const snapshot = await pageQuery.get();
    rows.push(...snapshot.docs);
    if (snapshot.size < PAGE_SIZE) break;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
  return rows;
}

function validStampRow(id, row, clientId) {
  if (asString(row.clientId) !== clientId || !asString(row.customerId)) return false;
  const type = asString(row.type);
  if (type && type !== "STAMP_ADDED") return false;
  if (!type && row.delta !== 1) return false;
  if (row.delta !== undefined && row.delta !== 1) return false;
  if (row.addedCount !== undefined && optionalNonNegativeInt(row.addedCount) !== 1) return false;
  if (row.visitCounted !== undefined && row.visitCounted !== true) return false;
  if (row.transactionId !== undefined && asString(row.transactionId) !== id) return false;
  return timestampToMillis(row.createdAt) !== undefined;
}

function validRedemptionRow(id, row, clientId) {
  if (asString(row.clientId) !== clientId || !asString(row.customerId)) return false;
  if (row.transactionId !== undefined && asString(row.transactionId) !== id) return false;
  if (optionalNonNegativeInt(row.stampCost) === undefined || row.stampCost < 1) return false;
  return timestampToMillis(row.redeemedAt) !== undefined || timestampToMillis(row.createdAt) !== undefined;
}

function historyKey(clientId, customerId) {
  return `${clientId}\u0000${customerId}`;
}

function updateIfDifferent(target, current, key, value) {
  if (!Object.is(current[key], value)) target[key] = value;
}

function makeRepairPlan(customer, loyalty, stampCount, redemptionCount, latestStampAt) {
  const customerId = customer.id;
  const clientId = asString(customer.data.clientId);
  if (!clientId) return { skipped: "customer has no canonical clientId" };
  if (!loyalty) return { skipped: "no loyaltyAccounts document; not creating one" };
  if (loyalty.clientId && loyalty.clientId !== clientId) {
    return { skipped: "loyalty account clientId conflicts with the customer" };
  }
  if (loyalty.customerId && loyalty.customerId !== customerId) {
    return { skipped: "loyalty account customerId conflicts with the customer document" };
  }

  const currentStamps = optionalNonNegativeInt(loyalty.currentStamps) ?? nonNegativeInt(loyalty.stamps);
  const storedLifetime = optionalNonNegativeInt(loyalty.lifetimeStamps) ?? 0;
  const lifetimeStamps = Math.max(currentStamps, storedLifetime, stampCount);
  const rewardsRedeemed = Math.max(
    nonNegativeInt(loyalty.rewardsRedeemed),
    nonNegativeInt(loyalty.totalRewardsRedeemed),
    redemptionCount
  );
  const rewardsEarned = Math.max(
    nonNegativeInt(loyalty.rewardsEarned),
    nonNegativeInt(loyalty.totalRewardsEarned),
    rewardsRedeemed
  );
  const loyaltyPatch = {};
  const storedLastStampMillis = timestampToMillis(loyalty.lastStampAt);
  const shouldRepairLastStamp =
    latestStampAt &&
    (!isFirestoreTimestamp(loyalty.lastStampAt) || storedLastStampMillis < latestStampAt.millis);
  if (shouldRepairLastStamp) loyaltyPatch.lastStampAt = latestStampAt.value;
  updateIfDifferent(loyaltyPatch, loyalty, "clientId", clientId);
  updateIfDifferent(loyaltyPatch, loyalty, "customerId", customerId);
  updateIfDifferent(loyaltyPatch, loyalty, "currentStamps", currentStamps);
  updateIfDifferent(loyaltyPatch, loyalty, "stamps", currentStamps);
  updateIfDifferent(loyaltyPatch, loyalty, "lifetimeStamps", lifetimeStamps);
  updateIfDifferent(loyaltyPatch, loyalty, "rewardsEarned", rewardsEarned);
  updateIfDifferent(loyaltyPatch, loyalty, "rewardsRedeemed", rewardsRedeemed);
  updateIfDifferent(loyaltyPatch, loyalty, "totalRewardsEarned", rewardsEarned);
  updateIfDifferent(loyaltyPatch, loyalty, "totalRewardsRedeemed", rewardsRedeemed);

  const currentVisits = optionalNonNegativeInt(customer.data.totalVisits) ?? 0;
  const totalVisits = Math.max(currentVisits, stampCount);
  const customerPatch = {};
  updateIfDifferent(customerPatch, customer.data, "totalVisits", totalVisits);

  if (Object.keys(loyaltyPatch).length === 0 && Object.keys(customerPatch).length === 0) return null;
  return {
    customerId,
    clientId,
    validStampTransactions: stampCount,
    validRewardRedemptions: redemptionCount,
    before: {
      currentStamps: loyalty.currentStamps ?? loyalty.stamps ?? null,
      lifetimeStamps: loyalty.lifetimeStamps ?? null,
      rewardsEarned: loyalty.rewardsEarned ?? loyalty.totalRewardsEarned ?? null,
      rewardsRedeemed: loyalty.rewardsRedeemed ?? loyalty.totalRewardsRedeemed ?? null,
      lastStampAt: timestampToMillis(loyalty.lastStampAt) === undefined
        ? null
        : new Date(timestampToMillis(loyalty.lastStampAt)).toISOString(),
      totalVisits: customer.data.totalVisits ?? null,
    },
    after: {
      currentStamps,
      lifetimeStamps,
      rewardsEarned,
      rewardsRedeemed,
      lastStampAt: shouldRepairLastStamp
        ? new Date(latestStampAt.millis).toISOString()
        : timestampToMillis(loyalty.lastStampAt) === undefined
          ? null
          : new Date(timestampToMillis(loyalty.lastStampAt)).toISOString(),
      totalVisits,
    },
    loyaltyPatch,
    customerPatch,
  };
}

async function main() {
  console.log(`Reading canonical customer data from Firebase project ${PROJECT_ID}…`);
  const customerDocs = await readAll(db.collection("customers"));
  const customers = customerDocs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }));
  const customerByKey = new Map();
  const phoneGroups = new Map();
  const invalidIdentityRecords = [];

  for (const customer of customers) {
    const clientId = asString(customer.data.clientId);
    if (!clientId) {
      invalidIdentityRecords.push({ customerId: customer.id, issue: "missing clientId" });
      continue;
    }
    customerByKey.set(historyKey(clientId, customer.id), customer);
    const phone = normalizePhone(customer.data.normalizedPhone) || normalizePhone(customer.data.phone);
    if (!phone) continue;
    const key = historyKey(clientId, phone);
    const group = phoneGroups.get(key) ?? { clientId, phone, customers: [] };
    group.customers.push(customer);
    phoneGroups.set(key, group);
  }

  const stampCounts = new Map();
  const redemptionCounts = new Map();
  const latestStampAtByKey = new Map();
  const clientDocs = await readAll(db.collection("clients"));
  let stampRowsRead = 0;
  let redemptionRowsRead = 0;
  for (const clientDoc of clientDocs) {
    const clientId = clientDoc.id;
    const clientRef = db.collection("clients").doc(clientId);
    const [stampRows, redemptionRows] = await Promise.all([
      readAll(clientRef.collection("stampTransactions")),
      readAll(clientRef.collection("rewardRedemptions")),
    ]);
    stampRowsRead += stampRows.length;
    redemptionRowsRead += redemptionRows.length;
    for (const rowSnap of stampRows) {
      const row = rowSnap.data();
      if (!validStampRow(rowSnap.id, row, clientId)) continue;
      const key = historyKey(clientId, asString(row.customerId));
      stampCounts.set(key, (stampCounts.get(key) ?? 0) + 1);
      const createdAtMillis = timestampToMillis(row.createdAt);
      const previousLatest = latestStampAtByKey.get(key);
      if (!previousLatest || createdAtMillis > previousLatest.millis) {
        latestStampAtByKey.set(key, { millis: createdAtMillis, value: row.createdAt });
      }
    }
    for (const rowSnap of redemptionRows) {
      const row = rowSnap.data();
      if (!validRedemptionRow(rowSnap.id, row, clientId)) continue;
      const key = historyKey(clientId, asString(row.customerId));
      redemptionCounts.set(key, (redemptionCounts.get(key) ?? 0) + 1);
    }
  }

  const duplicatePhoneGroups = [...phoneGroups.values()]
    .filter((group) => group.customers.length > 1)
    .map((group) => {
      const names = group.customers.map((customer) => normalizeName(customer.data.name));
      const uids = group.customers.map((customer) => asString(customer.data.uid || customer.data.authUid));
      const nonEmptyUids = uids.filter(Boolean);
      return {
        clientId: group.clientId,
        phoneMasked: maskPhone(group.phone),
        customerCount: group.customers.length,
        sameNormalizedName: names[0] !== "" && names.every((name) => name === names[0]),
        sameAuthUid: nonEmptyUids.length === group.customers.length && new Set(nonEmptyUids).size === 1,
        customers: group.customers.map((customer) => ({
          customerId: customer.id,
          name: asString(customer.data.name) || "(missing name)",
          customerCode: asString(customer.data.customerCode || customer.data.code || customer.data.displayId) || null,
          uidPresent: Boolean(asString(customer.data.uid || customer.data.authUid)),
        })),
        reviewRequired: true,
        disposition: "manual-review-only; same-name matches are not automatically merged",
      };
    });

  const proposedRepairs = [];
  const skippedRepairs = [];
  for (const customer of customers) {
    const clientId = asString(customer.data.clientId);
    if (!clientId) continue;
    const key = historyKey(clientId, customer.id);
    const loyaltySnapshot = await db.collection("loyaltyAccounts").doc(customer.id).get();
    const plan = makeRepairPlan(
      customer,
      loyaltySnapshot.exists ? loyaltySnapshot.data() : undefined,
      stampCounts.get(key) ?? 0,
      redemptionCounts.get(key) ?? 0,
      latestStampAtByKey.get(key)
    );
    if (!plan) continue;
    if (plan.skipped) {
      skippedRepairs.push({ clientId, customerId: customer.id, reason: plan.skipped });
      continue;
    }
    proposedRepairs.push(plan);
  }

  let appliedCustomers = 0;
  if (applyCounters) {
    for (const plan of proposedRepairs) {
      const customerRef = db.collection("customers").doc(plan.customerId);
      const loyaltyRef = db.collection("loyaltyAccounts").doc(plan.customerId);
      const currentStampCount = stampCounts.get(historyKey(plan.clientId, plan.customerId)) ?? 0;
      const currentRedemptionCount = redemptionCounts.get(historyKey(plan.clientId, plan.customerId)) ?? 0;
      const didUpdate = await db.runTransaction(async (transaction) => {
        const [customerSnap, loyaltySnap] = await Promise.all([
          transaction.get(customerRef),
          transaction.get(loyaltyRef),
        ]);
        if (!customerSnap.exists || !loyaltySnap.exists) return false;
        const currentCustomer = customerSnap.data();
        const currentLoyalty = loyaltySnap.data();
        if (asString(currentCustomer.clientId) !== plan.clientId) return false;
        const freshPlan = makeRepairPlan(
          { id: plan.customerId, data: currentCustomer },
          currentLoyalty,
          currentStampCount,
          currentRedemptionCount,
          latestStampAtByKey.get(historyKey(plan.clientId, plan.customerId))
        );
        if (!freshPlan || freshPlan.skipped) return false;
        if (Object.keys(freshPlan.customerPatch).length > 0) {
          transaction.update(customerRef, freshPlan.customerPatch);
        }
        if (Object.keys(freshPlan.loyaltyPatch).length > 0) {
          transaction.update(loyaltyRef, freshPlan.loyaltyPatch);
        }
        return Object.keys(freshPlan.customerPatch).length > 0 || Object.keys(freshPlan.loyaltyPatch).length > 0;
      });
      if (didUpdate) appliedCustomers += 1;
    }
  }

  const report = {
    projectId: PROJECT_ID,
    generatedAt: new Date().toISOString(),
    mode: applyCounters ? "counter-repair-applied" : "dry-run",
    destructiveCustomerMergeOrDelete: false,
    summary: {
      customersRead: customers.length,
      stampLedgerRowsRead: stampRowsRead,
      rewardRedemptionRowsRead: redemptionRowsRead,
      duplicatePhoneGroups: duplicatePhoneGroups.length,
      proposedCounterRepairs: proposedRepairs.length,
      skippedRepairs: skippedRepairs.length,
      appliedCounterRepairs: appliedCustomers,
      invalidIdentityRecords: invalidIdentityRecords.length,
    },
    duplicatePhoneGroups,
    proposedRepairs,
    skippedRepairs,
    invalidIdentityRecords,
    safety: [
      "A phone collision is scoped to one clientId; the same phone in a different business is allowed.",
      "Same-name customers without the same normalized phone are not duplicate candidates.",
      "No customer, token, index, activity, stamp, reward or notification document is merged or deleted.",
      "Counter proposals never lower current/lifetime/reward/visit history and are derived from canonical ledgers.",
    ],
  };

  const serialized = JSON.stringify(report, null, 2);
  if (outputPath) {
    writeFileSync(path.resolve(outputPath), `${serialized}\n`, { encoding: "utf8", flag: "w" });
    console.log(`Report written to ${path.resolve(outputPath)}`);
  }
  console.log(serialized);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
