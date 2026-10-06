export interface ClientConfig {
  id?: string | number;
  /** Canonical Firestore document id of clients/{clientId}. */
  clientId?: string;
  slug: string;
  name: string;
  businessName?: string;
  displayName?: string;
  tagline: string;
  logoText: string;
  logoUrl?: string | null;
  stampTarget: number;
  rewardName: string;
  rewardDescription: string;
  /** clients/{clientId}.loyalty.rewardImage — optional reward artwork. */
  rewardImageUrl?: string | null;
  /** clients/{clientId}.loyalty.enabled — false disables counter stamps. */
  loyaltyEnabled: boolean;
  primaryColor: string;
  accentColor: string;
  iconType: string;
  status?: string;
}

export interface StaffUser {
  id?: string | number;
  uid?: string;
  /** The canonical business clientId — the ONLY tenant source of truth. */
  clientId: string;
  clientSlug?: string;
  staffId?: string;
  name: string;
  email: string;
  phone?: string;
  role?: string;
  avatarUrl?: string;
  active?: boolean;
  status?: string;
}

export interface CustomerProfile {
  /** Document id in customers/{customerId} (the customer's Firebase Auth uid). */
  id: string;
  uid?: string;
  clientId: string;
  clientSlug?: string;
  /** Display code (`code` / `customerCode`, falling back to the document id). */
  customerCode?: string;
  name: string;
  email?: string;
  phone?: string;
  normalizedPhone?: string;
  phoneIndexId?: string;
  tableNumber?: string;
  visitingSince?: string;
  totalVisits: number;
  lastVisitAt?: string;
  lastVisitTransactionId?: string;
  qrToken?: string;
  status?: string;
  avatarInitial: string;
  avatarBg: string;
  stamps: number;
  stampTarget: number;
  rewardName: string;
  isEligibleForReward: boolean;
  lastStampAt?: string;
  updatedAt?: string;
  createdAt?: string;
  /**
   * Newest of lastStampAt / lastVisitAt / updatedAt / createdAt in epoch ms.
   * Presentation only (relative "2 mins ago" in the lookup list) — derived
   * from the same Firestore fields, never stored or invented.
   */
  lastActivityMillis?: number;
}

export interface StampTransactionResult {
  success: boolean;
  transactionId: string;
  previousStamps: number;
  newStamps: number;
  stampTarget: number;
  rewardUnlocked: boolean;
  rewardName: string;
  customer: CustomerProfile;
  message: string;
  /** True when the same idempotency key had already been processed. */
  replayed?: boolean;
}

export interface RewardRedemptionResult {
  success: boolean;
  transactionId: string;
  stampsResetFrom: number;
  stampsResetTo: number;
  rewardName: string;
  customer: CustomerProfile;
  message: string;
  replayed?: boolean;
}

export interface StaffActivityItem {
  id: string | number;
  clientId: string | number;
  clientSlug?: string;
  staffId?: string | number;
  staffName?: string;
  customerId?: string | number;
  customerName?: string;
  customerCode?: string;
  activityType: "STAMP_ADDED" | "REWARD_REDEEMED" | "NEW_CUSTOMER" | "CUSTOMER_VISIT";
  title: string;
  description: string;
  badgeText?: string;
  badgeType?: "stamp" | "reward" | "customer";
  timeFormatted: string;
  timestamp: string;
  transactionId?: string;
}

export interface DashboardStats {
  todayStamps: number;
  todayCustomers: number;
  todayReviews: number;
  rewardsRedeemed: number;
  /** false → the reviews metric could not be read (rules/network); UI shows "—". */
  reviewsAvailable: boolean;
  /** false → today's customers could not be counted (index/rules); UI shows "—". */
  customersAvailable: boolean;
  loadedAt?: string;
}

/** clients/{clientId}/notifications/{notificationId} */
export type StaffNotificationType = "REWARD_READY" | "STAMP_ADDED" | "REWARD_REDEEMED" | "SYSTEM";

export interface StaffNotification {
  id: string;
  clientId: string;
  type: StaffNotificationType;
  title: string;
  message: string;
  customerId?: string;
  read: boolean;
  createdAt?: string;
  createdAtMillis?: number;
  metadata?: Record<string, unknown>;
}

export interface StaffSession {
  firebaseUser: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
  };
  uid: string;
  staffRecord: StaffUser;
  clientId: string;
  clientRecord: ClientConfig;
}
