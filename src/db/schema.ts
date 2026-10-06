import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull().default("Café & Bakery"),
  logoText: text("logo_text").notNull().default("BAKE"),
  stampTarget: integer("stamp_target").notNull().default(8),
  rewardName: text("reward_name").notNull().default("Free Coffee"),
  rewardDescription: text("reward_description").notNull().default("Redeem any specialty beverage of your choice"),
  primaryColor: text("primary_color").notNull().default("#3A1E0D"),
  accentColor: text("accent_color").notNull().default("#D4A373"),
  iconType: text("icon_type").notNull().default("coffee-bean"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const staffUsers = pgTable("staff_users", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  staffId: text("staff_id").notNull(), // e.g., STAFF-001
  name: text("name").notNull(), // e.g., Amit
  email: text("email").notNull(),
  password: text("password").notNull().default("staff123"), // hashed or dev password
  role: text("role").notNull().default("Staff Member"),
  avatarUrl: text("avatar_url"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  customerCode: text("customer_code").notNull(), // e.g., C10342
  name: text("name").notNull(), // e.g., Rahul
  email: text("email"),
  phone: text("phone"),
  tableNumber: text("table_number"), // e.g. "Table: 3"
  visitingSince: text("visiting_since").notNull().default("Oct 2024"),
  totalVisits: integer("total_visits").notNull().default(1),
  qrToken: text("qr_token").notNull(), // signed token
  avatarInitial: text("avatar_initial").notNull().default("R"),
  avatarBg: text("avatar_bg").notNull().default("#E5D4C0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const loyaltyAccounts = pgTable("loyalty_accounts", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  stamps: integer("stamps").notNull().default(0),
  stampTarget: integer("stamp_target").notNull().default(8),
  rewardName: text("reward_name").notNull().default("Free Coffee"),
  isEligibleForReward: boolean("is_eligible_for_reward").notNull().default(false),
  totalRewardsEarned: integer("total_rewards_earned").notNull().default(0),
  totalRewardsRedeemed: integer("total_rewards_redeemed").notNull().default(0),
  lastStampAt: timestamp("last_stamp_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const stampTransactions = pgTable("stamp_transactions", {
  id: serial("id").primaryKey(),
  transactionId: text("transaction_id").notNull().unique(), // idempotency key
  clientId: integer("client_id").references(() => clients.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  staffId: integer("staff_id").references(() => staffUsers.id).notNull(),
  stampCountBefore: integer("stamp_count_before").notNull(),
  stampCountAfter: integer("stamp_count_after").notNull(),
  addedCount: integer("added_count").notNull().default(1),
  notes: text("notes"),
  qrTokenUsed: text("qr_token_used"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rewardRedemptions = pgTable("reward_redemptions", {
  id: serial("id").primaryKey(),
  transactionId: text("transaction_id").notNull().unique(), // idempotency key
  clientId: integer("client_id").references(() => clients.id).notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  staffId: integer("staff_id").references(() => staffUsers.id).notNull(),
  rewardName: text("reward_name").notNull(),
  stampsResetFrom: integer("stamps_reset_from").notNull(),
  stampsResetTo: integer("stamps_reset_to").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const staffActivities = pgTable("staff_activities", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  staffId: integer("staff_id").references(() => staffUsers.id),
  customerId: integer("customer_id").references(() => customers.id),
  activityType: text("activity_type").notNull(), // 'STAMP_ADDED' | 'REWARD_REDEEMED' | 'NEW_CUSTOMER' | 'CUSTOMER_VISIT'
  title: text("title").notNull(),
  description: text("description").notNull(),
  badgeText: text("badge_text"), // e.g., "+1"
  badgeType: text("badge_type"), // 'stamp' | 'reward' | 'customer'
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
