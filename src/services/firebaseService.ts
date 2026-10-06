import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  User as FirebaseUser,
  Auth,
} from "firebase/auth";
import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  where,
} from "firebase/firestore";
import { auth, db, firebaseConfigError } from "@/lib/firebase";
import {
  ClientConfig,
  CustomerProfile,
  DashboardStats,
  RewardRedemptionResult,
  StaffActivityItem,
  StaffUser,
  StampTransactionResult,
} from "./types";

type AuthorizedStaffContext = {
  staffUser: StaffUser;
  clientId: string;
};

type StampTransactionOutcome = {
  previousStamps: number;
  newStamps: number;
  stampTarget: number;
  rewardUnlocked: boolean;
  rewardName: string;
};

type RedemptionOutcome = {
  stampsResetFrom: number;
  rewardName: string;
};

const NOOP_UNSUBSCRIBE: Unsubscribe = () => undefined;

export class FirebaseService {
  /**
   * Listen for Firebase Auth state and resolve the authenticated user's one
   * business from staffUsers/{uid}. The URL is never used to choose a tenant.
   */
  static listenToAuth(
    onSuccess: (staff: StaffUser, client: ClientConfig) => void,
    onLoggedOut: () => void,
    onError: (errMsg: string) => void
  ): Unsubscribe {
    if (!auth) {
      onError(firebaseConfigError || "Firebase Authentication is unavailable.");
      return NOOP_UNSUBSCRIBE;
    }

    const firebaseAuth = auth;
    return onAuthStateChanged(firebaseAuth, async (user: FirebaseUser | null) => {
      if (!user) {
        onLoggedOut();
        return;
      }

      try {
        const staffUser = await this.resolveStaffUser(user);
        const client = await this.loadClientConfig(staffUser.clientId);
        onSuccess(staffUser, client);
      } catch (error: unknown) {
        console.error("Auth state resolution error:", error);
        await fbSignOut(firebaseAuth).catch(() => undefined);
        onError(this.formatErrorMessage(error));
      }
    });
  }

  /**
   * Sign in with Firebase Auth, then validate the staff registry and business
   * configuration before returning success.
   */
  static async login(
    email: string,
    password: string
  ): Promise<{ success: boolean; staffUser?: StaffUser; error?: string }> {
    if (!auth) {
      return {
        success: false,
        error: firebaseConfigError || "Firebase Authentication is unavailable.",
      };
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const staffUser = await this.resolveStaffUser(credential.user);
      await this.loadClientConfig(staffUser.clientId);
      return { success: true, staffUser };
    } catch (error: unknown) {
      console.error("Firebase login error:", error);
      await fbSignOut(auth).catch(() => undefined);
      return { success: false, error: this.formatErrorMessage(error) };
    }
  }

  static async logout(): Promise<void> {
    if (!auth) return;

    try {
      await fbSignOut(auth);
    } catch (error: unknown) {
      console.error("Sign out error:", error);
    }
  }

  /**
   * Resolve a client only after Firebase Auth has resolved the caller's
   * staffUsers/{uid} document. requestedClientId is only a consistency check;
   * it is never the source of authorization.
   */
  static async getClientConfig(requestedClientId?: string): Promise<ClientConfig> {
    const context = await this.getAuthenticatedStaffContext(requestedClientId);
    return this.loadClientConfig(context.clientId);
  }

  /**
   * QR flow:
   * customerTokens/{token} -> customers/{customerId} -> loyaltyAccounts/{customerId}
   * Every client ID in the payload or documents is checked against the
   * authenticated staff user's canonical clientId.
   */
  static async scanAndResolveCustomer(
    rawQR: string,
    requestedClientId?: string
  ): Promise<CustomerProfile> {
    const context = await this.getAuthenticatedStaffContext(requestedClientId);
    const clientId = context.clientId;

    if (!rawQR || typeof rawQR !== "string") {
      throw new Error("Invalid QR code format.");
    }

    let token = rawQR.trim();
    if (!token) throw new Error("Invalid QR code format.");

    if (token.startsWith("{") && token.endsWith("}")) {
      let parsed: { client?: unknown; token?: unknown; code?: unknown };
      try {
        parsed = JSON.parse(token) as typeof parsed;
      } catch {
        throw new Error("Invalid QR code format.");
      }

      if (parsed.client !== undefined && !this.sameClientId(parsed.client, clientId)) {
        throw new Error("This customer belongs to another business.");
      }

      const parsedToken = parsed.token ?? parsed.code;
      if (typeof parsedToken !== "string" || !parsedToken.trim()) {
        throw new Error("Invalid QR code format.");
      }
      token = parsedToken.trim();
    }

    if (token.includes("/")) {
      const parts = token.split("/").filter(Boolean);
      token = parts[parts.length - 1] || token;
    }

    let customerId = token;
    const firestore = this.getRequiredDb();
    const tokenSnap = await getDoc(doc(firestore, "customerTokens", token));

    if (tokenSnap.exists()) {
      const tokenData = tokenSnap.data();
      if (!this.sameClientId(tokenData.clientId, clientId)) {
        throw new Error("This customer belongs to another business.");
      }
      if (typeof tokenData.customerId !== "string" || !tokenData.customerId.trim()) {
        throw new Error("Customer QR token is not linked to a customer.");
      }
      customerId = tokenData.customerId.trim();
    }

    return this.loadCustomerById(customerId, clientId);
  }

  /**
   * Customer lookup is always scoped by the authenticated staff registry
   * record. A requested client ID can only be used to reject a mismatched URL.
   */
  static async getCustomerById(
    customerIdOrCode: string,
    requestedClientId?: string
  ): Promise<CustomerProfile> {
    const context = await this.getAuthenticatedStaffContext(requestedClientId);
    return this.loadCustomerById(customerIdOrCode, context.clientId);
  }

  static async getCustomers(
    requestedClientId?: string,
    search?: string
  ): Promise<CustomerProfile[]> {
    const context = await this.getAuthenticatedStaffContext(requestedClientId);
    const clientConfig = await this.loadClientConfig(context.clientId);
    const firestore = this.getRequiredDb();
    const customersQuery = query(
      collection(firestore, "customers"),
      where("clientId", "==", context.clientId),
      limit(50)
    );
    const snapshot = await getDocs(customersQuery);
    const list: CustomerProfile[] = [];

    for (const customerDoc of snapshot.docs) {
      const customerData = customerDoc.data();
      const loyaltyRef = doc(firestore, "loyaltyAccounts", customerDoc.id);
      const loyaltySnap = await getDoc(loyaltyRef);
      const loyaltyData = loyaltySnap.exists() ? loyaltySnap.data() : undefined;

      list.push(
        this.toCustomerProfile(
          customerDoc.id,
          customerData,
          loyaltyData,
          clientConfig,
          context.clientId
        )
      );
    }

    if (!search || !search.trim()) return list;

    const term = search.trim().toLowerCase().replace(/^#/, "");
    return list.filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        customer.customerCode?.toLowerCase().includes(term) ||
        customer.phone?.includes(term) ||
        customer.email?.toLowerCase().includes(term)
    );
  }

  /**
   * Add a stamp and count the visit in one Firestore transaction. The
   * idempotency document, customer, and loyalty account are all read before
   * any write. Replaying the same transaction ID returns the original result.
   */
  static async addStamp(
    customerId: string,
    idempotencyTxId?: string,
    notes?: string
  ): Promise<StampTransactionResult> {
    const context = await this.getAuthenticatedStaffContext();
    const clientConfig = await this.loadClientConfig(context.clientId);
    this.requireValidLoyaltyConfiguration(clientConfig);

    const cleanCustomerId = customerId.trim();
    if (!cleanCustomerId) throw new Error("Customer ID is required.");

    const transactionId = this.createTransactionId("stamp", idempotencyTxId);
    const firestore = this.getRequiredDb();
    const txRef = doc(
      firestore,
      "clients",
      context.clientId,
      "stampTransactions",
      transactionId
    );
    const customerRef = doc(firestore, "customers", cleanCustomerId);
    const loyaltyRef = doc(firestore, "loyaltyAccounts", cleanCustomerId);

    const outcome = await runTransaction(firestore, async (transaction) => {
      const customerDoc = await transaction.get(customerRef);
      const loyaltyDoc = await transaction.get(loyaltyRef);
      const existingTxDoc = await transaction.get(txRef);

      if (!customerDoc.exists()) {
        throw new Error("Customer profile not found.");
      }

      const customerData = customerDoc.data();
      this.assertClientOwnership(customerData.clientId, context.clientId);

      if (existingTxDoc.exists()) {
        const existing = existingTxDoc.data();
        if (existing.type !== "STAMP_ADDED") {
          throw new Error("The transaction ID is already used for another operation.");
        }
        this.assertClientOwnership(existing.clientId, context.clientId);
        if (String(existing.customerId) !== cleanCustomerId) {
          throw new Error("The transaction ID belongs to another customer.");
        }

        const previousStamps = this.nonNegativeNumber(existing.stampCountBefore);
        const newStamps = this.nonNegativeNumber(existing.stampCountAfter);
        const existingTarget = this.positiveNumber(existing.stampTarget);
        const stampTarget = existingTarget || clientConfig.stampTarget;
        const rewardName = this.stringValue(existing.rewardName) || clientConfig.rewardName;
        return {
          previousStamps,
          newStamps,
          stampTarget,
          rewardUnlocked:
            existing.rewardUnlocked === true || newStamps >= stampTarget,
          rewardName,
        } satisfies StampTransactionOutcome;
      }

      const loyaltyData = loyaltyDoc.exists() ? loyaltyDoc.data() : undefined;
      if (loyaltyData) {
        this.assertClientOwnership(loyaltyData.clientId, context.clientId);
        if (
          loyaltyData.customerId !== undefined &&
          String(loyaltyData.customerId) !== cleanCustomerId
        ) {
          throw new Error("Customer loyalty account mismatch.");
        }
      }

      const stampTarget =
        this.positiveNumber(loyaltyData?.stampTarget) || clientConfig.stampTarget;
      const rewardName =
        this.stringValue(loyaltyData?.rewardName) || clientConfig.rewardName;
      const previousStamps = this.nonNegativeNumber(loyaltyData?.stamps);
      const newStamps = previousStamps + 1;
      const rewardUnlocked = newStamps >= stampTarget;
      const previousVisits = this.nonNegativeNumber(customerData.totalVisits);
      const customerName = this.stringValue(customerData.name) || "Customer";
      const customerCode =
        this.stringValue(customerData.customerCode) || cleanCustomerId.substring(0, 6);

      transaction.set(txRef, {
        clientId: context.clientId,
        customerId: cleanCustomerId,
        staffId: context.staffUser.uid,
        staffName: context.staffUser.name,
        type: "STAMP_ADDED",
        title: "Stamp Added",
        description: `${customerName} #${customerCode}`,
        customerName,
        customerCode,
        addedCount: 1,
        visitCounted: true,
        stampCountBefore: previousStamps,
        stampCountAfter: newStamps,
        stampTarget,
        rewardName,
        rewardUnlocked,
        notes: notes?.trim() || "Standard loyalty stamp",
        createdAt: serverTimestamp(),
      });

      transaction.update(customerRef, {
        totalVisits: previousVisits + 1,
        lastVisitAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastVisitTransactionId: transactionId,
      });

      transaction.set(
        loyaltyRef,
        {
          clientId: context.clientId,
          customerId: cleanCustomerId,
          stamps: newStamps,
          stampTarget,
          rewardName,
          isEligibleForReward: rewardUnlocked,
          lastStampAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return {
        previousStamps,
        newStamps,
        stampTarget,
        rewardUnlocked,
        rewardName,
      } satisfies StampTransactionOutcome;
    });

    const updatedCustomer = await this.loadCustomerById(
      cleanCustomerId,
      context.clientId
    );

    return {
      success: true,
      transactionId,
      previousStamps: outcome.previousStamps,
      newStamps: outcome.newStamps,
      stampTarget: outcome.stampTarget,
      rewardUnlocked: outcome.rewardUnlocked,
      rewardName: outcome.rewardName,
      customer: updatedCustomer,
      message: `Stamp added successfully to ${updatedCustomer.name}'s account!`,
    };
  }

  /**
   * Redeem a reward atomically. The redemption record is the idempotency
   * record and the nested stampTransactions record is the activity record.
   */
  static async redeemReward(
    customerId: string,
    idempotencyTxId?: string
  ): Promise<RewardRedemptionResult> {
    const context = await this.getAuthenticatedStaffContext();
    const clientConfig = await this.loadClientConfig(context.clientId);
    this.requireValidLoyaltyConfiguration(clientConfig);

    const cleanCustomerId = customerId.trim();
    if (!cleanCustomerId) throw new Error("Customer ID is required.");

    const redemptionId = this.createTransactionId("reward", idempotencyTxId);
    const firestore = this.getRequiredDb();
    const redemptionRef = doc(
      firestore,
      "clients",
      context.clientId,
      "rewardRedemptions",
      redemptionId
    );
    const activityRef = doc(
      firestore,
      "clients",
      context.clientId,
      "stampTransactions",
      redemptionId
    );
    const customerRef = doc(firestore, "customers", cleanCustomerId);
    const loyaltyRef = doc(firestore, "loyaltyAccounts", cleanCustomerId);

    const outcome = await runTransaction(firestore, async (transaction) => {
      const customerDoc = await transaction.get(customerRef);
      const loyaltyDoc = await transaction.get(loyaltyRef);
      const redemptionDoc = await transaction.get(redemptionRef);
      const activityDoc = await transaction.get(activityRef);

      if (!customerDoc.exists() || !loyaltyDoc.exists()) {
        throw new Error("Customer or loyalty account not found.");
      }

      const customerData = customerDoc.data();
      const loyaltyData = loyaltyDoc.data();
      this.assertClientOwnership(customerData.clientId, context.clientId);
      this.assertClientOwnership(loyaltyData.clientId, context.clientId);
      if (
        loyaltyData.customerId !== undefined &&
        String(loyaltyData.customerId) !== cleanCustomerId
      ) {
        throw new Error("Customer loyalty account mismatch.");
      }

      if (redemptionDoc.exists()) {
        const existing = redemptionDoc.data();
        this.assertClientOwnership(existing.clientId, context.clientId);
        if (String(existing.customerId) !== cleanCustomerId) {
          throw new Error("The redemption ID belongs to another customer.");
        }
        return {
          stampsResetFrom: this.nonNegativeNumber(existing.stampsResetFrom),
          rewardName:
            this.stringValue(existing.rewardName) || clientConfig.rewardName,
        } satisfies RedemptionOutcome;
      }

      if (activityDoc.exists()) {
        throw new Error("The transaction ID is already used for another operation.");
      }

      const stampTarget =
        this.positiveNumber(loyaltyData.stampTarget) || clientConfig.stampTarget;
      const currentStamps = this.nonNegativeNumber(loyaltyData.stamps);
      const rewardName =
        this.stringValue(loyaltyData.rewardName) || clientConfig.rewardName;

      if (currentStamps < stampTarget && loyaltyData.isEligibleForReward !== true) {
        throw new Error(
          `Customer has only ${currentStamps}/${stampTarget} stamps. Not eligible for reward.`
        );
      }

      const customerName = this.stringValue(customerData.name) || "Customer";
      const customerCode =
        this.stringValue(customerData.customerCode) || cleanCustomerId.substring(0, 6);

      transaction.set(redemptionRef, {
        clientId: context.clientId,
        customerId: cleanCustomerId,
        customerName,
        rewardName,
        stampsResetFrom: currentStamps,
        stampsResetTo: 0,
        staffUid: context.staffUser.uid,
        staffName: context.staffUser.name,
        redeemedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        transactionId: redemptionId,
      });

      transaction.set(activityRef, {
        clientId: context.clientId,
        customerId: cleanCustomerId,
        staffId: context.staffUser.uid,
        staffName: context.staffUser.name,
        customerName,
        customerCode,
        type: "REWARD_REDEEMED",
        title: "Reward Redeemed",
        description: `${customerName} #${customerCode}`,
        badgeText: "Gift",
        badgeType: "reward",
        createdAt: serverTimestamp(),
      });

      transaction.update(loyaltyRef, {
        stamps: 0,
        isEligibleForReward: false,
        totalRewardsRedeemed:
          this.nonNegativeNumber(loyaltyData.totalRewardsRedeemed) + 1,
        updatedAt: serverTimestamp(),
      });

      transaction.update(customerRef, {
        updatedAt: serverTimestamp(),
      });

      return { stampsResetFrom: currentStamps, rewardName } satisfies RedemptionOutcome;
    });

    const updatedCustomer = await this.loadCustomerById(
      cleanCustomerId,
      context.clientId
    );

    return {
      success: true,
      transactionId: redemptionId,
      stampsResetFrom: outcome.stampsResetFrom,
      stampsResetTo: 0,
      rewardName: outcome.rewardName,
      customer: updatedCustomer,
      message: `Reward "${outcome.rewardName}" successfully redeemed for ${updatedCustomer.name}!`,
    };
  }

  static listenToRecentActivity(
    requestedClientId: string | undefined,
    callback: (items: StaffActivityItem[]) => void,
    onError?: (message: string) => void
  ): Unsubscribe {
    let cancelled = false;
    let unsubscribe: Unsubscribe = NOOP_UNSUBSCRIBE;

    void this.getAuthenticatedStaffContext(requestedClientId)
      .then((context) => {
        if (cancelled) return;
        const firestore = this.getRequiredDb();
        const activitiesQuery = query(
          collection(firestore, "clients", context.clientId, "stampTransactions"),
          orderBy("createdAt", "desc"),
          limit(30)
        );

        unsubscribe = onSnapshot(
          activitiesQuery,
          (snapshot) => {
            callback(
              snapshot.docs.map((activityDoc) =>
                this.toActivityItem(activityDoc.id, activityDoc.data(), context.clientId)
              )
            );
          },
          (error: unknown) => {
            console.warn("Recent activity listener notice:", error);
            onError?.(this.formatErrorMessage(error));
          }
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) onError?.(this.formatErrorMessage(error));
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }

  static listenToDashboardStats(
    requestedClientId: string | undefined,
    callback: (stats: DashboardStats) => void,
    onError?: (message: string) => void
  ): Unsubscribe {
    let cancelled = false;
    let unsubscribeAll: Unsubscribe = NOOP_UNSUBSCRIBE;

    void this.getAuthenticatedStaffContext(requestedClientId)
      .then((context) => {
        if (cancelled) return;
        const firestore = this.getRequiredDb();
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const stampsQuery = query(
          collection(firestore, "clients", context.clientId, "stampTransactions"),
          where("createdAt", ">=", Timestamp.fromDate(startOfToday))
        );
        const customersQuery = query(
          collection(firestore, "customers"),
          where("clientId", "==", context.clientId)
        );
        const redemptionsQuery = query(
          collection(firestore, "clients", context.clientId, "rewardRedemptions")
        );

        let stampsToday = 0;
        let customerCount = 0;
        let rewardsRedeemed = 0;
        const emit = () =>
          callback({
            todayStamps: stampsToday,
            todayCustomers: customerCount,
            todayReviews: 0,
            rewardsRedeemed,
          });

        const unsubStamps = onSnapshot(
          stampsQuery,
          (snapshot) => {
            stampsToday = snapshot.docs.filter(
              (activityDoc) => activityDoc.data().type === "STAMP_ADDED"
            ).length;
            emit();
          },
          (error: unknown) => onError?.(this.formatErrorMessage(error))
        );
        const unsubCustomers = onSnapshot(
          customersQuery,
          (snapshot) => {
            customerCount = snapshot.size;
            emit();
          },
          (error: unknown) => onError?.(this.formatErrorMessage(error))
        );
        const unsubRedemptions = onSnapshot(
          redemptionsQuery,
          (snapshot) => {
            rewardsRedeemed = snapshot.size;
            emit();
          },
          (error: unknown) => onError?.(this.formatErrorMessage(error))
        );

        unsubscribeAll = () => {
          unsubStamps();
          unsubCustomers();
          unsubRedemptions();
        };
      })
      .catch((error: unknown) => {
        if (!cancelled) onError?.(this.formatErrorMessage(error));
      });

    return () => {
      cancelled = true;
      unsubscribeAll();
    };
  }

  private static async getAuthenticatedStaffContext(
    requestedClientId?: string
  ): Promise<AuthorizedStaffContext> {
    const firebaseAuth = this.getRequiredAuth();
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error("Please sign in to continue.");

    const staffUser = await this.resolveStaffUser(user);
    if (
      requestedClientId &&
      !this.sameClientId(requestedClientId.trim(), staffUser.clientId)
    ) {
      throw new Error("This URL is not assigned to your staff account.");
    }

    return { staffUser, clientId: staffUser.clientId };
  }

  private static async resolveStaffUser(user: FirebaseUser): Promise<StaffUser> {
    const firestore = this.getRequiredDb();
    const staffSnap = await getDoc(doc(firestore, "staffUsers", user.uid));
    if (!staffSnap.exists()) {
      throw new Error("Your staff account was not found in the staff registry.");
    }

    const data = staffSnap.data();
    const clientId = this.stringValue(data.clientId);
    const status = this.stringValue(data.status)?.toLowerCase();
    if (
      !clientId ||
      data.active === false ||
      status === "inactive" ||
      status === "disabled" ||
      status === "suspended"
    ) {
      throw new Error("Your staff account is inactive or is not assigned to a business.");
    }

    return {
      uid: user.uid,
      id: user.uid,
      clientId,
      clientSlug: clientId,
      staffId:
        this.stringValue(data.staffId) || user.uid.substring(0, 8).toUpperCase(),
      name:
        this.stringValue(data.name) ||
        user.displayName ||
        user.email?.split("@")[0] ||
        "Staff Member",
      email: this.stringValue(data.email) || user.email || "",
      phone: this.stringValue(data.phone),
      role: this.stringValue(data.role) || "Staff Member",
      active: data.active !== false,
      status: this.stringValue(data.status) || "active",
      avatarUrl: this.stringValue(data.avatarUrl),
    };
  }

  private static async loadClientConfig(clientId: string): Promise<ClientConfig> {
    const firestore = this.getRequiredDb();
    const cleanClientId = clientId.trim();
    if (!cleanClientId) throw new Error("Business configuration is missing.");

    const clientSnap = await getDoc(doc(firestore, "clients", cleanClientId));
    if (!clientSnap.exists()) {
      throw new Error("Your assigned business configuration was not found in Firebase.");
    }

    const data = clientSnap.data();
    const stampTarget = this.positiveNumber(data.stampTarget);
    const rewardName = this.stringValue(data.rewardName);
    if (!Number.isInteger(stampTarget) || stampTarget < 1 || !rewardName) {
      throw new Error("Your assigned business configuration is incomplete in Firebase.");
    }

    return {
      id: cleanClientId,
      slug: cleanClientId,
      name: this.stringValue(data.name) || cleanClientId,
      tagline: this.stringValue(data.tagline) || "LOYALTY PROGRAM",
      logoText: this.stringValue(data.logoText) || this.stringValue(data.name) || cleanClientId,
      stampTarget,
      rewardName,
      rewardDescription:
        this.stringValue(data.rewardDescription) || "Configured loyalty reward",
      primaryColor: this.stringValue(data.primaryColor) || "#3A1E0D",
      accentColor: this.stringValue(data.accentColor) || "#D4A373",
      iconType: this.stringValue(data.iconType) || "coffee-bean",
    };
  }

  private static async loadCustomerById(
    customerIdOrCode: string,
    clientId: string
  ): Promise<CustomerProfile> {
    const cleanId = customerIdOrCode.trim();
    if (!cleanId) throw new Error("Customer ID is required.");

    const firestore = this.getRequiredDb();
    const clientConfig = await this.loadClientConfig(clientId);
    const directRef = doc(firestore, "customers", cleanId);
    const directSnap = await getDoc(directRef);
    let customerDocId = cleanId;
    let customerData = directSnap.exists() ? directSnap.data() : undefined;

    if (customerData) {
      this.assertClientOwnership(customerData.clientId, clientId);
    }

    if (!customerData) {
      const codeQuery = query(
        collection(firestore, "customers"),
        where("clientId", "==", clientId),
        where("customerCode", "==", cleanId),
        limit(1)
      );
      const codeSnapshot = await getDocs(codeQuery);
      if (!codeSnapshot.empty) {
        const first = codeSnapshot.docs[0];
        customerDocId = first.id;
        customerData = first.data();
      }
    }

    if (!customerData) {
      const uidQuery = query(
        collection(firestore, "customers"),
        where("clientId", "==", clientId),
        where("uid", "==", cleanId),
        limit(1)
      );
      const uidSnapshot = await getDocs(uidQuery);
      if (!uidSnapshot.empty) {
        const first = uidSnapshot.docs[0];
        customerDocId = first.id;
        customerData = first.data();
      }
    }

    if (!customerData) {
      throw new Error(`Customer "${cleanId}" not found for this store.`);
    }

    return this.toCustomerProfile(
      customerDocId,
      customerData,
      await this.loadLoyaltyData(customerDocId, clientId),
      clientConfig,
      clientId
    );
  }

  private static async loadLoyaltyData(
    customerId: string,
    clientId: string
  ): Promise<Record<string, unknown> | undefined> {
    const loyaltySnap = await getDoc(doc(this.getRequiredDb(), "loyaltyAccounts", customerId));
    if (!loyaltySnap.exists()) return undefined;

    const loyaltyData = loyaltySnap.data();
    this.assertClientOwnership(loyaltyData.clientId, clientId);
    if (
      loyaltyData.customerId !== undefined &&
      String(loyaltyData.customerId) !== customerId
    ) {
      throw new Error("Customer loyalty account mismatch.");
    }
    return loyaltyData;
  }

  private static toCustomerProfile(
    customerDocId: string,
    customerData: Record<string, any>,
    loyaltyData: Record<string, unknown> | undefined,
    clientConfig: ClientConfig,
    clientId: string
  ): CustomerProfile {
    this.assertClientOwnership(customerData.clientId, clientId);
    if (loyaltyData) {
      this.assertClientOwnership(loyaltyData.clientId, clientId);
      if (
        loyaltyData.customerId !== undefined &&
        String(loyaltyData.customerId) !== customerDocId
      ) {
        throw new Error("Customer loyalty account mismatch.");
      }
    }

    const stampTarget =
      this.positiveNumber(loyaltyData?.stampTarget) || clientConfig.stampTarget;
    const stamps = this.nonNegativeNumber(loyaltyData?.stamps);
    const name = this.stringValue(customerData.name) || "Customer";
    const colors = [
      "#E8D5C4",
      "#C4D8E8",
      "#F4D2D2",
      "#D7E9D7",
      "#D2E4F4",
      "#FED7AA",
      "#E9D5FF",
    ];
    const avatarBg = colors[customerDocId.charCodeAt(0) % colors.length] || "#E8D5C4";

    return {
      id: customerDocId,
      uid: this.stringValue(customerData.uid) || customerDocId,
      clientId,
      clientSlug: clientId,
      customerCode:
        this.stringValue(customerData.customerCode) || customerDocId.substring(0, 6).toUpperCase(),
      name,
      email: this.stringValue(customerData.email),
      phone: this.stringValue(customerData.phone),
      normalizedPhone: this.stringValue(customerData.normalizedPhone),
      phoneIndexId: this.stringValue(customerData.phoneIndexId),
      tableNumber: this.stringValue(customerData.tableNumber),
      visitingSince: this.stringValue(customerData.visitingSince),
      totalVisits: this.nonNegativeNumber(customerData.totalVisits),
      lastVisitAt: this.formatFirestoreTimestamp(customerData.lastVisitAt),
      lastVisitTransactionId: this.stringValue(customerData.lastVisitTransactionId),
      qrToken: this.stringValue(customerData.qrToken) || customerDocId,
      status: this.stringValue(customerData.status) || "active",
      avatarInitial: name.charAt(0).toUpperCase() || "C",
      avatarBg,
      stamps,
      stampTarget,
      rewardName: this.stringValue(loyaltyData?.rewardName) || clientConfig.rewardName,
      isEligibleForReward:
        loyaltyData?.isEligibleForReward === true ||
        (stampTarget > 0 && stamps >= stampTarget),
      lastStampAt: this.formatFirestoreTimestamp(loyaltyData?.lastStampAt),
      updatedAt: this.formatFirestoreTimestamp(customerData.updatedAt),
    };
  }

  private static toActivityItem(
    id: string,
    data: Record<string, any>,
    clientId: string
  ): StaffActivityItem {
    const isReward = data.type === "REWARD_REDEEMED";
    return {
      id,
      clientId,
      staffId: data.staffId,
      staffName: data.staffName,
      customerId: data.customerId,
      customerName: data.customerName,
      customerCode: data.customerCode,
      activityType: isReward ? "REWARD_REDEEMED" : "STAMP_ADDED",
      title: data.title || (isReward ? "Reward Redeemed" : "Stamp Added"),
      description:
        data.description || `Customer #${String(data.customerId || "").substring(0, 6)}`,
      badgeText: isReward ? "Gift" : "+1",
      badgeType: isReward ? "reward" : "stamp",
      timeFormatted: this.formatTimeOnly(data.createdAt),
      timestamp: this.formatFirestoreTimestamp(data.createdAt) || new Date().toISOString(),
      transactionId: id,
    };
  }

  private static requireValidLoyaltyConfiguration(client: ClientConfig): void {
    if (!Number.isInteger(client.stampTarget) || client.stampTarget < 1) {
      throw new Error("The assigned business has an invalid stamp target configuration.");
    }
    if (!client.rewardName.trim()) {
      throw new Error("The assigned business has an invalid reward configuration.");
    }
  }

  private static createTransactionId(prefix: string, requested?: string): string {
    const value = requested?.trim() || `tx_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
      throw new Error("Invalid transaction ID.");
    }
    return value;
  }

  private static assertClientOwnership(value: unknown, expectedClientId: string): void {
    if (!this.sameClientId(value, expectedClientId)) {
      throw new Error("Cross-business access denied.");
    }
  }

  private static sameClientId(value: unknown, expectedClientId: string): boolean {
    return (
      (typeof value === "string" || typeof value === "number") &&
      String(value).trim().toLowerCase() === expectedClientId.trim().toLowerCase()
    );
  }

  private static stringValue(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private static positiveNumber(value: unknown): number {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  private static nonNegativeNumber(value: unknown): number {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  private static formatFirestoreTimestamp(value: unknown): string | undefined {
    if (!value) return undefined;
    try {
      const date =
        typeof (value as { toDate?: unknown }).toDate === "function"
          ? (value as { toDate: () => Date }).toDate()
          : new Date(value as string | number | Date);
      if (Number.isNaN(date.getTime())) return undefined;
      return new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(date);
    } catch {
      return undefined;
    }
  }

  private static formatTimeOnly(value: unknown): string {
    if (!value) return "Just now";
    try {
      const date =
        typeof (value as { toDate?: unknown }).toDate === "function"
          ? (value as { toDate: () => Date }).toDate()
          : new Date(value as string | number | Date);
      if (Number.isNaN(date.getTime())) return "Just now";
      return new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(date);
    } catch {
      return "Just now";
    }
  }

  private static getRequiredAuth(): Auth {
    if (!auth) {
      throw new Error(firebaseConfigError || "Firebase Authentication is unavailable.");
    }
    return auth;
  }

  private static getRequiredDb(): Firestore {
    if (!db) {
      throw new Error(firebaseConfigError || "Firestore is unavailable.");
    }
    return db;
  }

  private static formatErrorMessage(error: unknown): string {
    const value = error as { code?: unknown; message?: unknown };
    const code = typeof value?.code === "string" ? value.code : "";
    const message = typeof value?.message === "string" ? value.message : "";

    if (
      code.includes("auth/invalid-credential") ||
      code.includes("auth/wrong-password") ||
      code.includes("auth/user-not-found")
    ) {
      return "Invalid email or password.";
    }
    if (code.includes("auth/user-disabled")) {
      return "Your staff account is inactive.";
    }
    if (code.includes("auth/network-request-failed") || message.toLowerCase().includes("network")) {
      return "Unable to connect. Please check your network connection.";
    }
    if (code.includes("permission-denied") || message.toLowerCase().includes("permission")) {
      return "Access denied by Firebase security rules.";
    }
    return message || "An unexpected Firebase error occurred.";
  }
}
