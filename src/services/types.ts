export interface ClientConfig {
  id?: string | number;
  slug: string;
  name: string;
  tagline: string;
  logoText: string;
  stampTarget: number;
  rewardName: string;
  rewardDescription: string;
  primaryColor: string;
  accentColor: string;
  iconType: string;
}

export interface StaffUser {
  id?: string | number;
  uid?: string;
  clientId: string; // The canonical business clientId
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
  id: string; // Document ID in customers/{customerId}
  uid?: string;
  clientId: string;
  clientSlug?: string;
  customerCode?: string; // Display code e.g. C10342
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
}

export interface RewardRedemptionResult {
  success: boolean;
  transactionId: string;
  stampsResetFrom: number;
  stampsResetTo: number;
  rewardName: string;
  customer: CustomerProfile;
  message: string;
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
  activityType: 'STAMP_ADDED' | 'REWARD_REDEEMED' | 'NEW_CUSTOMER' | 'CUSTOMER_VISIT';
  title: string;
  description: string;
  badgeText?: string;
  badgeType?: 'stamp' | 'reward' | 'customer';
  timeFormatted: string;
  timestamp: string;
  transactionId?: string;
}

export interface DashboardStats {
  todayStamps: number;
  todayCustomers: number;
  todayReviews: number;
  rewardsRedeemed: number;
}
