import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  StaffUser,
  ClientConfig,
  CustomerProfile,
  StampTransactionResult,
  RewardRedemptionResult,
  StaffActivityItem,
  DashboardStats,
} from "./types";

export class FirebaseService {
  /**
   * Listen for Firebase Auth state changes and validate against staffUsers collection
   */
  static listenToAuth(
    onSuccess: (staff: StaffUser, client: ClientConfig) => void,
    onLoggedOut: () => void,
    onError: (errMsg: string) => void
  ): Unsubscribe {
    return onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
      if (!user) {
        onLoggedOut();
        return;
      }

      try {
        const staffDocRef = doc(db, "staffUsers", user.uid);
        const staffSnap = await getDoc(staffDocRef);

        if (!staffSnap.exists()) {
          await fbSignOut(auth);
          onError("Your staff account was not found in the staff registry.");
          return;
        }

        const data = staffSnap.data();

        // Validate active and status
        if (
          data.active === false ||
          data.status === "inactive" ||
          data.status === "disabled" ||
          data.status === "suspended" ||
          !data.clientId
        ) {
          await fbSignOut(auth);
          onError("Your staff account is inactive.");
          return;
        }

        const staffUser: StaffUser = {
          uid: user.uid,
          id: user.uid,
          clientId: String(data.clientId),
          clientSlug: String(data.clientId),
          staffId: data.staffId || user.uid.substring(0, 8).toUpperCase(),
          name: data.name || user.displayName || user.email?.split("@")[0] || "Staff Member",
          email: data.email || user.email || "",
          phone: data.phone || "",
          role: data.role || "Staff Member",
          active: data.active !== false,
          status: data.status || "active",
          avatarUrl: data.avatarUrl,
        };

        // Load client configuration
        const clientConfig = await this.getClientConfig(staffUser.clientId);
        onSuccess(staffUser, clientConfig);
      } catch (err: any) {
        console.error("Auth state resolution error:", err);
        onError(this.formatErrorMessage(err));
      }
    });
  }

  /**
   * Firebase Sign In
   */
  static async login(email: string, password: string): Promise<{ success: boolean; staffUser?: StaffUser; error?: string }> {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const uid = cred.user.uid;

      const staffDocRef = doc(db, "staffUsers", uid);
      const staffSnap = await getDoc(staffDocRef);

      if (!staffSnap.exists()) {
        await fbSignOut(auth);
        return { success: false, error: "Your staff account was not found." };
      }

      const data = staffSnap.data();
      if (
        data.active === false ||
        data.status === "inactive" ||
        data.status === "disabled" ||
        data.status === "suspended" ||
        !data.clientId
      ) {
        await fbSignOut(auth);
        return { success: false, error: "Your staff account is inactive." };
      }

      const staffUser: StaffUser = {
        uid,
        id: uid,
        clientId: String(data.clientId),
        clientSlug: String(data.clientId),
        staffId: data.staffId || uid.substring(0, 8).toUpperCase(),
        name: data.name || cred.user.displayName || email.split("@")[0] || "Staff",
        email: data.email || email,
        phone: data.phone || "",
        role: data.role || "Staff Member",
        active: true,
        status: data.status || "active",
      };

      return { success: true, staffUser };
    } catch (err: any) {
      console.error("Firebase login error:", err);
      return { success: false, error: this.formatErrorMessage(err) };
    }
  }

  /**
   * Firebase Sign Out
   */
  static async logout(): Promise<void> {
    try {
      await fbSignOut(auth);
    } catch (e) {
      console.error("Sign out error:", e);
    }
  }

  /**
   * Load client branding/rewards configuration from clients/{clientId}
   */
  static async getClientConfig(clientId: string): Promise<ClientConfig> {
    const defaultConfigs: Record<string, ClientConfig> = {
      bake: {
        id: "bake",
        slug: "bake",
        name: "BAKE",
        tagline: "CAFÉ & BAKERY",
        logoText: "BAKE",
        stampTarget: 8,
        rewardName: "Free Coffee",
        rewardDescription: "Redeem any specialty beverage of your choice",
        primaryColor: "#3A1E0D",
        accentColor: "#D4A373",
        iconType: "coffee-bean",
      },
      "sharma-cafe": {
        id: "sharma-cafe",
        slug: "sharma-cafe",
        name: "Sharma Café",
        tagline: "ROASTERY & KITCHEN",
        logoText: "SHARMA",
        stampTarget: 10,
        rewardName: "Free Pizza",
        rewardDescription: "Redeem any wood-fired artisan pizza",
        primaryColor: "#431407",
        accentColor: "#EA580C",
        iconType: "coffee-bean",
      },
      "royal-restaurant": {
        id: "royal-restaurant",
        slug: "royal-restaurant",
        name: "Royal Restaurant",
        tagline: "FINE DINING & LOUNGE",
        logoText: "ROYAL",
        stampTarget: 6,
        rewardName: "Chef's Tasting Dessert",
        rewardDescription: "Complimentary handcrafted luxury dessert platter",
        primaryColor: "#064E3B",
        accentColor: "#10B981",
        iconType: "chef-hat",
      },
    };

    try {
      const clientDocRef = doc(db, "clients", clientId);
      const snap = await getDoc(clientDocRef);
      if (snap.exists()) {
        const d = snap.data();
        return {
          id: clientId,
          slug: clientId,
          name: d.name || clientId.toUpperCase(),
          tagline: d.tagline || "LOYALTY CLUB",
          logoText: d.logoText || d.name || clientId.toUpperCase(),
          stampTarget: Number(d.stampTarget) || 8,
          rewardName: d.rewardName || "Free Reward",
          rewardDescription: d.rewardDescription || "Redeem your milestone reward",
          primaryColor: d.primaryColor || "#3A1E0D",
          accentColor: d.accentColor || "#D4A373",
          iconType: d.iconType || "coffee-bean",
        };
      }
    } catch (e) {
      console.warn("Client doc fetch notice:", e);
    }

    return defaultConfigs[clientId.toLowerCase()] || {
      id: clientId,
      slug: clientId,
      name: clientId.toUpperCase(),
      tagline: "LOYALTY EXPERIENCE",
      logoText: clientId.toUpperCase(),
      stampTarget: 8,
      rewardName: "Free Reward",
      rewardDescription: "Milestone loyalty reward",
      primaryColor: "#3A1E0D",
      accentColor: "#D4A373",
      iconType: "coffee-bean",
    };
  }

  /**
   * QR Scanning Flow:
   * 1. Extract token
   * 2. Read customerTokens/{token}
   * 3. Verify token.clientId === staffClientId
   * 4. Read customers/{customerId}
   * 5. Verify customer.clientId === staffClientId
   * 6. Read loyaltyAccounts/{customerId}
   */
  static async scanAndResolveCustomer(rawQR: string, staffClientId: string): Promise<CustomerProfile> {
    if (!rawQR || typeof rawQR !== "string") {
      throw new Error("Invalid QR code format.");
    }

    let token = rawQR.trim();

    // Check if JSON format
    if (token.startsWith("{") && token.endsWith("}")) {
      try {
        const parsed = JSON.parse(token);
        if (parsed.client && parsed.client.toLowerCase() !== staffClientId.toLowerCase()) {
          throw new Error("This customer belongs to another business.");
        }
        token = parsed.token || parsed.code || token;
      } catch (err: any) {
        if (err.message === "This customer belongs to another business.") throw err;
      }
    }

    // Check if URI format
    if (token.includes("/")) {
      const parts = token.split("/").filter(Boolean);
      token = parts[parts.length - 1];
    }

    let customerId = token;

    // 1. Try reading customerTokens/{token}
    try {
      const tokenRef = doc(db, "customerTokens", token);
      const tokenSnap = await getDoc(tokenRef);

      if (tokenSnap.exists()) {
        const tokenData = tokenSnap.data();
        if (tokenData.clientId && tokenData.clientId.toLowerCase() !== staffClientId.toLowerCase()) {
          throw new Error("This customer belongs to another business.");
        }
        if (tokenData.customerId) {
          customerId = tokenData.customerId;
        }
      }
    } catch (err: any) {
      if (err.message === "This customer belongs to another business.") throw err;
    }

    // 2. Fetch Customer Document
    return await this.getCustomerById(customerId, staffClientId);
  }

  /**
   * Customer Details Lookup with strict client isolation
   */
  static async getCustomerById(customerIdOrCode: string, staffClientId: string): Promise<CustomerProfile> {
    const cleanId = customerIdOrCode.trim();

    // Try direct document ID in customers/{customerId}
    const custRef = doc(db, "customers", cleanId);
    let snap = await getDoc(custRef);
    let custDocId = cleanId;
    let custData = snap.exists() ? snap.data() : null;

    // If not found directly, query by customerCode or phone or qrToken within this client
    if (!custData) {
      const q = query(
        collection(db, "customers"),
        where("clientId", "==", staffClientId),
        where("customerCode", "==", cleanId)
      );
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        const first = qSnap.docs[0];
        custDocId = first.id;
        custData = first.data();
      }
    }

    if (!custData) {
      // Also try querying by uid
      const qUid = query(
        collection(db, "customers"),
        where("clientId", "==", staffClientId),
        where("uid", "==", cleanId)
      );
      const qSnap = await getDocs(qUid);
      if (!qSnap.empty) {
        const first = qSnap.docs[0];
        custDocId = first.id;
        custData = first.data();
      }
    }

    if (!custData) {
      throw new Error(`Customer "${cleanId}" not found for this store.`);
    }

    // Verify tenant isolation
    if (custData.clientId && custData.clientId.toLowerCase() !== staffClientId.toLowerCase()) {
      throw new Error("This customer belongs to another business.");
    }

    // Read loyalty account
    let loyaltyData: any = null;
    try {
      const loyaltyRef = doc(db, "loyaltyAccounts", custDocId);
      const loyaltySnap = await getDoc(loyaltyRef);
      if (loyaltySnap.exists()) {
        loyaltyData = loyaltySnap.data();
      }
    } catch (e) {
      console.warn("Loyalty doc read error:", e);
    }

    // Format timestamps
    const lastVisitAtStr = this.formatFirestoreTimestamp(custData.lastVisitAt);
    const lastStampAtStr = loyaltyData ? this.formatFirestoreTimestamp(loyaltyData.lastStampAt) : lastVisitAtStr;
    const updatedAtStr = this.formatFirestoreTimestamp(custData.updatedAt);

    const clientConfig = await this.getClientConfig(staffClientId);
    const stampTarget = loyaltyData?.stampTarget || clientConfig.stampTarget || 8;
    const stamps = loyaltyData?.stamps || 0;
    const isEligible = stamps >= stampTarget || !!loyaltyData?.isEligibleForReward;

    const avatarInitial = (custData.name?.charAt(0) || "C").toUpperCase();
    const colors = ["#E8D5C4", "#C4D8E8", "#F4D2D2", "#D7E9D7", "#D2E4F4", "#FED7AA", "#E9D5FF"];
    const avatarBg = colors[custDocId.charCodeAt(0) % colors.length] || "#E8D5C4";

    return {
      id: custDocId,
      uid: custData.uid || custDocId,
      clientId: staffClientId,
      clientSlug: staffClientId,
      customerCode: custData.customerCode || custDocId.substring(0, 6).toUpperCase(),
      name: custData.name || "Customer",
      email: custData.email,
      phone: custData.phone,
      normalizedPhone: custData.normalizedPhone,
      phoneIndexId: custData.phoneIndexId,
      tableNumber: custData.tableNumber || "Table: 1",
      visitingSince: custData.visitingSince || "Recently",
      totalVisits: Number(custData.totalVisits) || 1,
      lastVisitAt: lastVisitAtStr,
      lastVisitTransactionId: custData.lastVisitTransactionId,
      qrToken: custData.qrToken || custDocId,
      status: custData.status || "active",
      avatarInitial,
      avatarBg,
      stamps,
      stampTarget,
      rewardName: loyaltyData?.rewardName || clientConfig.rewardName || "Free Coffee",
      isEligibleForReward: isEligible,
      lastStampAt: lastStampAtStr,
      updatedAt: updatedAtStr,
    };
  }

  /**
   * Query customer directory for this staff client
   */
  static async getCustomers(staffClientId: string, search?: string): Promise<CustomerProfile[]> {
    try {
      const q = query(
        collection(db, "customers"),
        where("clientId", "==", staffClientId),
        limit(50)
      );

      const snap = await getDocs(q);
      const list: CustomerProfile[] = [];

      for (const d of snap.docs) {
        const custData = d.data();
        const custDocId = d.id;

        // Skip if client isolation check fails
        if (custData.clientId && custData.clientId.toLowerCase() !== staffClientId.toLowerCase()) {
          continue;
        }

        // Fetch loyalty data
        let stamps = 0;
        let isEligible = false;
        let stampTarget = 8;
        let rewardName = "Free Coffee";
        let lastStampAtStr: string | undefined;

        try {
          const lRef = doc(db, "loyaltyAccounts", custDocId);
          const lSnap = await getDoc(lRef);
          if (lSnap.exists()) {
            const ld = lSnap.data();
            stamps = ld.stamps || 0;
            stampTarget = ld.stampTarget || 8;
            rewardName = ld.rewardName || "Free Coffee";
            isEligible = stamps >= stampTarget || !!ld.isEligibleForReward;
            lastStampAtStr = this.formatFirestoreTimestamp(ld.lastStampAt);
          }
        } catch {
          // ignore
        }

        const avatarInitial = (custData.name?.charAt(0) || "C").toUpperCase();
        const colors = ["#E8D5C4", "#C4D8E8", "#F4D2D2", "#D7E9D7", "#D2E4F4", "#FED7AA", "#E9D5FF"];
        const avatarBg = colors[custDocId.charCodeAt(0) % colors.length] || "#E8D5C4";

        list.push({
          id: custDocId,
          uid: custData.uid || custDocId,
          clientId: staffClientId,
          clientSlug: staffClientId,
          customerCode: custData.customerCode || custDocId.substring(0, 6).toUpperCase(),
          name: custData.name || "Customer",
          email: custData.email,
          phone: custData.phone,
          tableNumber: custData.tableNumber || "Table: 1",
          visitingSince: custData.visitingSince || "Recently",
          totalVisits: Number(custData.totalVisits) || 1,
          lastVisitAt: this.formatFirestoreTimestamp(custData.lastVisitAt),
          lastVisitTransactionId: custData.lastVisitTransactionId,
          qrToken: custData.qrToken || custDocId,
          status: custData.status || "active",
          avatarInitial,
          avatarBg,
          stamps,
          stampTarget,
          rewardName,
          isEligibleForReward: isEligible,
          lastStampAt: lastStampAtStr,
          updatedAt: this.formatFirestoreTimestamp(custData.updatedAt),
        });
      }

      if (!search || !search.trim()) {
        return list;
      }

      const term = search.trim().toLowerCase().replace(/^#/, "");
      return list.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.customerCode && c.customerCode.toLowerCase().includes(term)) ||
          (c.phone && c.phone.includes(term)) ||
          (c.email && c.email.toLowerCase().includes(term))
      );
    } catch (err: any) {
      console.error("getCustomers error:", err);
      return [];
    }
  }

  /**
   * CRITICAL: 2-Step Atomic Stamp Transaction with Visit Counting & Idempotency
   *
   * STEP 1: Create clients/{clientId}/stampTransactions/{transactionId} with visitCounted: false
   * STEP 2: Atomic Firestore transaction that reads customer and transaction, verifies client ownership,
   *         marks visitCounted: true, increments totalVisits + 1, and updates loyaltyAccounts.
   */
  static async addStamp(
    staffClientId: string,
    customerId: string,
    staffUser: StaffUser,
    idempotencyTxId?: string,
    notes?: string
  ): Promise<StampTransactionResult> {
    const transactionId = idempotencyTxId || `tx_stamp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const txRef = doc(db, "clients", staffClientId, "stampTransactions", transactionId);
    const customerRef = doc(db, "customers", customerId);
    const loyaltyRef = doc(db, "loyaltyAccounts", customerId);

    // STEP 1: Verify Customer & Create stamp transaction with visitCounted: false (if not already existing)
    const existingTxSnap = await getDoc(txRef);

    if (!existingTxSnap.exists()) {
      // First verify customer exists and belongs to staffClientId
      const custCheck = await getDoc(customerRef);
      if (!custCheck.exists()) {
        throw new Error("Customer profile not found.");
      }
      if (custCheck.data().clientId && custCheck.data().clientId.toLowerCase() !== staffClientId.toLowerCase()) {
        throw new Error("This customer belongs to another business.");
      }

      const custName = custCheck.data().name || "Customer";

      await setDoc(txRef, {
        clientId: staffClientId,
        customerId: customerId,
        staffId: staffUser.uid || staffUser.staffId || "staff",
        staffName: staffUser.name || "Staff",
        type: "STAMP_ADDED",
        title: "Stamp Added",
        description: `${custName} #${custCheck.data().customerCode || customerId.substring(0, 6)}`,
        addedCount: 1,
        visitCounted: false,
        notes: notes || "Standard loyalty stamp",
        createdAt: serverTimestamp(),
      });
    }

    // STEP 2: Atomic Firestore Transaction for Visit Counting & Loyalty Update
    const result = await runTransaction(db, async (transaction) => {
      const custDoc = await transaction.get(customerRef);
      const txDoc = await transaction.get(txRef);
      const loyaltyDoc = await transaction.get(loyaltyRef);

      if (!custDoc.exists()) {
        throw new Error("Customer document missing during transaction.");
      }
      if (!txDoc.exists()) {
        throw new Error("Stamp transaction document missing during transaction.");
      }

      const custData = custDoc.data();
      const txData = txDoc.data();

      // VERIFY:
      // transaction.clientId === staffClientId
      // transaction.customerId === customerId
      // customer.clientId === staffClientId
      if (txData.clientId !== staffClientId || custData.clientId !== staffClientId) {
        throw new Error("Tenant isolation check failed: Client ID mismatch.");
      }
      if (txData.customerId !== customerId) {
        throw new Error("Customer ID mismatch in stamp transaction.");
      }

      const clientConfig = await this.getClientConfig(staffClientId);
      const stampTarget = loyaltyDoc.exists() ? (loyaltyDoc.data().stampTarget || clientConfig.stampTarget || 8) : (clientConfig.stampTarget || 8);
      const rewardName = loyaltyDoc.exists() ? (loyaltyDoc.data().rewardName || clientConfig.rewardName || "Free Coffee") : (clientConfig.rewardName || "Free Coffee");
      const currentStamps = loyaltyDoc.exists() ? (loyaltyDoc.data().stamps || 0) : 0;
      const currentVisits = Number(custData.totalVisits) || 0;

      const isAlreadyCounted = txData.visitCounted === true;
      const newVisits = isAlreadyCounted ? currentVisits : currentVisits + 1;
      const newStamps = isAlreadyCounted ? currentStamps : currentStamps + 1;
      const isRewardReady = newStamps >= stampTarget;

      if (!isAlreadyCounted) {
        // 1. Mark transaction visitCounted = true
        transaction.update(txRef, {
          visitCounted: true,
          visitCountedAt: serverTimestamp(),
          stampCountBefore: currentStamps,
          stampCountAfter: newStamps,
        });

        // 2. Increment customer totalVisits and set lastVisitAt & lastVisitTransactionId
        transaction.update(customerRef, {
          totalVisits: newVisits,
          lastVisitAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastVisitTransactionId: transactionId,
        });

        // 3. Update loyalty account atomically
        transaction.set(
          loyaltyRef,
          {
            clientId: staffClientId,
            customerId: customerId,
            stamps: newStamps,
            stampTarget: stampTarget,
            rewardName: rewardName,
            isEligibleForReward: isRewardReady,
            lastStampAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      return {
        previousStamps: currentStamps,
        newStamps,
        stampTarget,
        isRewardReady,
        rewardName,
        totalVisits: newVisits,
      };
    });

    // Return updated profile
    const updatedCustomer = await this.getCustomerById(customerId, staffClientId);

    return {
      success: true,
      transactionId,
      previousStamps: result.previousStamps,
      newStamps: result.newStamps,
      stampTarget: result.stampTarget,
      rewardUnlocked: result.isRewardReady,
      rewardName: result.rewardName,
      customer: updatedCustomer,
      message: `Stamp added successfully to ${updatedCustomer.name}'s account!`,
    };
  }

  /**
   * CRITICAL: Reward Redemption inside clients/{clientId}/rewardRedemptions/{redemptionId}
   */
  static async redeemReward(
    staffClientId: string,
    customerId: string,
    staffUser: StaffUser,
    idempotencyTxId?: string
  ): Promise<RewardRedemptionResult> {
    const redemptionId = idempotencyTxId || `tx_reward_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const redemptionRef = doc(db, "clients", staffClientId, "rewardRedemptions", redemptionId);
    const txRef = doc(db, "clients", staffClientId, "stampTransactions", redemptionId);
    const customerRef = doc(db, "customers", customerId);
    const loyaltyRef = doc(db, "loyaltyAccounts", customerId);

    await runTransaction(db, async (transaction) => {
      const custDoc = await transaction.get(customerRef);
      const loyaltyDoc = await transaction.get(loyaltyRef);
      const redemptionDoc = await transaction.get(redemptionRef);

      if (redemptionDoc.exists()) {
        // Idempotency: already redeemed
        return;
      }

      if (!custDoc.exists() || !loyaltyDoc.exists()) {
        throw new Error("Customer or loyalty account not found.");
      }

      const custData = custDoc.data();
      const loyaltyData = loyaltyDoc.data();

      // Verify client isolation
      if (custData.clientId !== staffClientId || loyaltyData.clientId !== staffClientId) {
        throw new Error("Cross-business access denied.");
      }

      const stampTarget = loyaltyData.stampTarget || 8;
      const currentStamps = loyaltyData.stamps || 0;
      const rewardName = loyaltyData.rewardName || "Free Coffee";

      if (currentStamps < stampTarget && !loyaltyData.isEligibleForReward) {
        throw new Error(`Customer has only ${currentStamps}/${stampTarget} stamps. Not eligible for reward.`);
      }

      // 1. Create reward redemption document in clients/{clientId}/rewardRedemptions/{redemptionId}
      transaction.set(redemptionRef, {
        clientId: staffClientId,
        customerId: customerId,
        customerName: custData.name || "Customer",
        rewardName: rewardName,
        stampsResetFrom: currentStamps,
        stampsResetTo: 0,
        staffUid: staffUser.uid || staffUser.staffId || "staff",
        staffName: staffUser.name || "Staff",
        redeemedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        transactionId: redemptionId,
      });

      // 2. Also log in stampTransactions so it surfaces in staff activity
      transaction.set(txRef, {
        clientId: staffClientId,
        customerId: customerId,
        staffId: staffUser.uid || staffUser.staffId || "staff",
        staffName: staffUser.name || "Staff",
        type: "REWARD_REDEEMED",
        title: "Reward Redeemed",
        description: `${custData.name || "Customer"} #${custData.customerCode || customerId.substring(0, 6)}`,
        badgeText: "Gift",
        badgeType: "reward",
        createdAt: serverTimestamp(),
      });

      // 3. Reset loyalty stamps to 0
      transaction.update(loyaltyRef, {
        stamps: 0,
        isEligibleForReward: false,
        totalRewardsRedeemed: (loyaltyData.totalRewardsRedeemed || 0) + 1,
        updatedAt: serverTimestamp(),
      });

      // 4. Update customer updatedAt
      transaction.update(customerRef, {
        updatedAt: serverTimestamp(),
      });
    });

    const updatedCustomer = await this.getCustomerById(customerId, staffClientId);

    return {
      success: true,
      transactionId: redemptionId,
      stampsResetFrom: updatedCustomer.stampTarget,
      stampsResetTo: 0,
      rewardName: updatedCustomer.rewardName,
      customer: updatedCustomer,
      message: `Reward "${updatedCustomer.rewardName}" successfully redeemed for ${updatedCustomer.name}!`,
    };
  }

  /**
   * Listen for real-time Recent Activity in clients/{clientId}/stampTransactions
   */
  static listenToRecentActivity(
    staffClientId: string,
    callback: (items: StaffActivityItem[]) => void
  ): Unsubscribe {
    const q = query(
      collection(db, "clients", staffClientId, "stampTransactions"),
      orderBy("createdAt", "desc"),
      limit(30)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const items: StaffActivityItem[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          const isReward = d.type === "REWARD_REDEEMED";
          return {
            id: docSnap.id,
            clientId: staffClientId,
            staffId: d.staffId,
            staffName: d.staffName,
            customerId: d.customerId,
            customerName: d.customerName,
            customerCode: d.customerCode,
            activityType: isReward ? "REWARD_REDEEMED" : "STAMP_ADDED",
            title: d.title || (isReward ? "Reward Redeemed" : "Stamp Added"),
            description: d.description || `Customer #${d.customerId?.substring(0, 6) || ""}`,
            badgeText: isReward ? "Gift" : "+1",
            badgeType: isReward ? "reward" : "stamp",
            timeFormatted: this.formatTimeOnly(d.createdAt),
            timestamp: this.formatFirestoreTimestamp(d.createdAt),
            transactionId: docSnap.id,
          };
        });
        callback(items);
      },
      (err) => {
        console.warn("Recent activity listener notice:", err);
      }
    );
  }

  /**
   * Listen for Live Dashboard Stats
   */
  static listenToDashboardStats(
    staffClientId: string,
    callback: (stats: DashboardStats) => void
  ): Unsubscribe {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const qStamps = query(
      collection(db, "clients", staffClientId, "stampTransactions"),
      where("createdAt", ">=", Timestamp.fromDate(startOfToday))
    );

    const qRedemptions = query(
      collection(db, "clients", staffClientId, "rewardRedemptions")
    );

    const qCust = query(
      collection(db, "customers"),
      where("clientId", "==", staffClientId)
    );

    let stampsToday = 0;
    let totalCust = 0;
    let redeemed = 0;

    const unsubStamps = onSnapshot(qStamps, (snap) => {
      stampsToday = snap.size;
      callback({
        todayStamps: stampsToday,
        todayCustomers: totalCust,
        todayReviews: 0,
        rewardsRedeemed: redeemed,
      });
    }, () => {});

    const unsubCust = onSnapshot(qCust, (snap) => {
      totalCust = snap.size;
      callback({
        todayStamps: stampsToday,
        todayCustomers: totalCust,
        todayReviews: 0,
        rewardsRedeemed: redeemed,
      });
    }, () => {});

    const unsubRedeem = onSnapshot(qRedemptions, (snap) => {
      redeemed = snap.size;
      callback({
        todayStamps: stampsToday,
        todayCustomers: totalCust,
        todayReviews: 0,
        rewardsRedeemed: redeemed,
      });
    }, () => {});

    return () => {
      unsubStamps();
      unsubCust();
      unsubRedeem();
    };
  }

  /**
   * Helper: Format Firestore Timestamp to human date string
   */
  private static formatFirestoreTimestamp(ts: any): string {
    if (!ts) return "Recently";
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(date);
    } catch {
      return "Recently";
    }
  }

  private static formatTimeOnly(ts: any): string {
    if (!ts) return "Just now";
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(date);
    } catch {
      return "Just now";
    }
  }

  private static formatErrorMessage(err: any): string {
    const code = err.code || "";
    const msg = err.message || "";

    if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password") || code.includes("auth/user-not-found")) {
      return "Invalid email or password.";
    }
    if (code.includes("auth/user-disabled")) {
      return "Your staff account is inactive.";
    }
    if (code.includes("auth/network-request-failed") || msg.includes("network")) {
      return "Unable to connect. Please check your network connection.";
    }
    if (code.includes("permission-denied") || msg.includes("permission")) {
      return "Access denied by security policies.";
    }
    return msg || "An unexpected error occurred.";
  }
}
