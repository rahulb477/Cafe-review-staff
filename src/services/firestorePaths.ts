/**
 * CANONICAL FIRESTORE PATHS — the single source of truth for the Staff App.
 *
 * Shared platform schema (Admin + Customer + Staff apps, project cafe-review7):
 *
 *   staffUsers/{uid}
 *   clients/{clientId}
 *     loyalty.{enabled,stampTarget,rewardName,rewardDescription,rewardImage}  (embedded config)
 *     /stampTransactions/{transactionId}     append-only ledger
 *     /rewardRedemptions/{redemptionId}      append-only ledger
 *     /reviews/{reviewId}
 *     /notifications/{notificationId}        staff notifications
 *   customers/{customerId}
 *   customerTokens/{token}                   { customerId, clientId, createdAt }
 *   loyaltyAccounts/{customerId}             { clientId, customerId, stamps, ... }
 *
 * Legacy top-level `stampTransactions/{id}` and `rewardRedemptions/{id}` are NOT
 * used anywhere in this app — every ledger write is nested under the assigned
 * business so Security Rules can scope it to the staff member's clientId.
 */

export const COLLECTIONS = {
  staffUsers: "staffUsers",
  clients: "clients",
  customers: "customers",
  customerTokens: "customerTokens",
  loyaltyAccounts: "loyaltyAccounts",
} as const;

export const SUBCOLLECTIONS = {
  stampTransactions: "stampTransactions",
  rewardRedemptions: "rewardRedemptions",
  reviews: "reviews",
  notifications: "notifications",
} as const;

/** Firestore document ids must be non-empty and must not contain path separators. */
const UNSAFE_SEGMENT_RE = /[\/\\\u0000]/;

export function assertSafeSegment(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > 1500) throw new Error(`${label} is too long.`);
  if (UNSAFE_SEGMENT_RE.test(trimmed) || trimmed === "." || trimmed === "..") {
    throw new Error(`${label} contains invalid characters.`);
  }
  return trimmed;
}

export const staffUserPath = (uid: string) => `${COLLECTIONS.staffUsers}/${uid}`;
export const clientPath = (clientId: string) => `${COLLECTIONS.clients}/${clientId}`;
export const customerPath = (customerId: string) => `${COLLECTIONS.customers}/${customerId}`;
export const customerTokenPath = (token: string) => `${COLLECTIONS.customerTokens}/${token}`;
export const loyaltyAccountPath = (customerId: string) =>
  `${COLLECTIONS.loyaltyAccounts}/${customerId}`;
export const stampTransactionsPath = (clientId: string) =>
  `${clientPath(clientId)}/${SUBCOLLECTIONS.stampTransactions}`;
export const rewardRedemptionsPath = (clientId: string) =>
  `${clientPath(clientId)}/${SUBCOLLECTIONS.rewardRedemptions}`;
export const reviewsPath = (clientId: string) =>
  `${clientPath(clientId)}/${SUBCOLLECTIONS.reviews}`;
export const notificationsPath = (clientId: string) =>
  `${clientPath(clientId)}/${SUBCOLLECTIONS.notifications}`;
