import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  User as FirebaseUser,
  Unsubscribe,
} from "firebase/auth";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  documentId,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  DocumentReference,
  DocumentSnapshot,
} from "firebase/firestore";
import { firebaseConfigError, getFirebaseAuth, getFirestoreDb } from "@/lib/firebase";
import {
  avatarTintFor,
  formatTimestamp,
  formatTimestampTime,
  timestampToIso,
  timestampToMillis,
} from "@/lib/format";
import type { Firestore } from "firebase/firestore";
import {
  buildClientConfig,
  buildStaffUser,
  firstString,
  isStampLedgerEntry,
  nonNegativeInt,
  nonNegativeIntOrUndefined,
  numberValue,
  isRewardRedeemable,
  nextStampBalance,
  remainingStampsAfterRedemption,
  resolveLoyaltyState,
  resolveStampTarget,
  stringValue,
  validateStaffRecord,
  visitBaseline,
  type UnknownRecord,
} from "./clientConfig";
import {
  COLLECTIONS,
  SUBCOLLECTIONS,
  assertSafeSegment,
  customerPath,
  customerTokenPath,
  loyaltyAccountPath,
  notificationsPath,
  rewardRedemptionsPath,
  reviewsPath,
  staffUserPath,
  stampTransactionsPath,
} from "./firestorePaths";
import { parseCustomerQrPayload } from "./qrPayload";
import {
  formatCooldownRemaining,
  getStampCooldownState,
  reconcileLifetimeStamps,
  STAMP_COOLDOWN_MS,
} from "./stampPolicy";
import {
  buildCustomerDirectoryQuery,
  buildCustomerExactSearchQueries,
  buildCustomerNamePrefixQuery,
  buildNotificationsListenerQuery,
  buildTodayCustomersCountQuery,
} from "./firestoreQueries";
import { isClientReadySession } from "./staffSession";
import {
  describeErrorForDiagnostics,
  isMissingIndexError,
  isPermissionDeniedError,
  readErrorCode,
  staffError,
  StampCooldownError,
  StaffServiceError,
  toStaffServiceError,
} from "./staffErrors";
import {
  ClientConfig,
  CustomerProfile,
  DashboardStats,
  RewardRedemptionResult,
  StaffActivityItem,
  StaffNotification,
  StaffNotificationType,
  StaffSession,
  StaffUser,
  StampTransactionResult,
} from "./types";

const NOOP_UNSUBSCRIBE: Unsubscribe = () => undefined;
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
const CUSTOMER_DIRECTORY_LIMIT = 30;
const CUSTOMER_SEARCH_LIMIT = 25;
const ACTIVITY_LIMIT = 30;
const NOTIFICATION_LIMIT = 20;
/** Upper bound for today's ledger listener (dashboard). */
const TODAY_LEDGER_LIMIT = 500;

type StampTransactionOutcome = {
  previousStamps: number;
  newStamps: number;
  stampTarget: number;
  rewardUnlocked: boolean;
  rewardName: string;
  customerId: string;
  customerName: string;
  replayed: boolean;
};

type HistoricalLoyaltyCounts = {
  stampCount?: number;
  redemptionCount?: number;
};

type RedemptionOutcome = {
  stampsResetFrom: number;
  stampsResetTo: number;
  rewardName: string;
  customerId: string;
  customerName: string;
  replayed: boolean;
};

type FirestoreRequestTrace = {
  operation: string;
  path: string;
  sessionUid?: string;
  clientId?: string;
  constraints?: string[];
  orderBy?: string;
  limit?: number;
  index?: string;
  rule?: string;
};

export type StaffAuthEvent =
  | { status: "initializing" }
  | { status: "signed-out" }
  | { status: "authorizing"; firebaseUser: FirebaseUser }
  | { status: "authorized"; session: StaffSession }
  | { status: "error"; error: StaffServiceError; firebaseUser: FirebaseUser | null };

export type LoginResult =
  | { ok: true; session: StaffSession }
  | { ok: false; error: StaffServiceError };

/**
 * The Staff App data layer.
 *
 * Authorization chain (the ONLY way a business is ever resolved):
 *
 *   Firebase Auth UID → staffUsers/{uid} → validate → clientId → clients/{clientId}
 *
 * `clientId` is never read from the URL, query string, localStorage, a dropdown
 * or a QR payload. Every business read/write is scoped to the resolved clientId.
 */
export class FirebaseService {
  private static sessionCache: { uid: string; session: StaffSession; expiresAt: number } | null = null;
  private static suppressNextSignedOut = false;

  /* ------------------------------------------------------------------ *
   * Session / authentication
   * ------------------------------------------------------------------ */

  /**
   * Subscribes to Firebase Auth.
   *
   * While authentication is still resolving the caller receives `initializing`
   * (or `authorizing`) — never an error — so a login screen can render its
   * loading state instead of "staff account not found".
   */
  static observeAuthState(handler: (event: StaffAuthEvent) => void): Unsubscribe {
    const auth = getFirebaseAuth();
    if (!auth) {
      handler({ status: "error", error: this.configurationError(), firebaseUser: null });
      return NOOP_UNSUBSCRIBE;
    }

    handler({ status: "initializing" });

    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        if (this.suppressNextSignedOut) {
          // The signed-out event belongs to a rejected authorization we already
          // reported; don't overwrite that error with a blank state.
          this.suppressNextSignedOut = false;
          return;
        }
        this.sessionCache = null;
        handler({ status: "signed-out" });
        return;
      }

      handler({ status: "authorizing", firebaseUser: user });

      void this.resolveSession(user)
        .then((session) => {
          if (!auth.currentUser || auth.currentUser.uid !== user.uid) {
            // Auth changed while the registry was being read — ignore the result.
            return;
          }
          handler({ status: "authorized", session });
        })
        .catch(async (error: unknown) => {
          const staffErr = toStaffServiceError(error, "UNKNOWN", { detail: "resolve staff session" });
          console.error("[staff-auth] authorization failed:", describeErrorForDiagnostics(staffErr));
          this.sessionCache = null;
          // Specification: sign the user out when authorization fails.
          try {
            this.suppressNextSignedOut = true;
            await fbSignOut(auth);
          } catch {
            this.suppressNextSignedOut = false;
          }
          handler({ status: "error", error: staffErr, firebaseUser: user });
        });
    });
  }

  /** Authenticates, then validates the staff registry + assigned business. */
  static async login(email: string, password: string): Promise<LoginResult> {
    const auth = getFirebaseAuth();
    if (!auth) return { ok: false, error: this.configurationError() };

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      return {
        ok: false,
        error: toStaffServiceError(new Error("missing credentials"), "AUTH_FAILED"),
      };
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const session = await this.resolveSession(credential.user);
      return { ok: true, session };
    } catch (error: unknown) {
      const staffErr = toStaffServiceError(error, "AUTH_FAILED");
      console.error("[staff-login] failed:", describeErrorForDiagnostics(staffErr));
      this.sessionCache = null;
      // Never keep a half-authorized session alive.
      if (!this.isConfigurationError(staffErr)) {
        try {
          this.suppressNextSignedOut = true;
          await fbSignOut(auth);
        } catch {
          this.suppressNextSignedOut = false;
        }
      }
      return { ok: false, error: staffErr };
    }
  }

  static async logout(): Promise<void> {
    const auth = getFirebaseAuth();
    this.sessionCache = null;
    if (!auth) return;
    try {
      await fbSignOut(auth);
    } catch (error: unknown) {
      console.warn("[staff-logout] sign out notice:", describeErrorForDiagnostics(error));
    }
  }

  static getCachedSession(): StaffSession | null {
    if (!this.sessionCache) return null;
    if (Date.now() > this.sessionCache.expiresAt) {
      this.sessionCache = null;
      return null;
    }
    return this.sessionCache.session;
  }

  static invalidateSession(): void {
    this.sessionCache = null;
  }

  /** Re-reads staffUsers/{uid} + clients/{clientId} for the current user. */
  static async refreshSession(): Promise<StaffSession> {
    const user = this.getRequiredAuth().currentUser;
    if (!user) throw staffError("AUTH_REQUIRED");
    this.sessionCache = null;
    return this.resolveSession(user);
  }

  /**
   * Resolves and validates the whole authorization chain for a Firebase user.
   * Used by the auth listener, login and any operation that needs the business
   * context. Every step produces a distinct, accurate error.
   */
  static async resolveSession(user: FirebaseUser): Promise<StaffSession> {
    const cached = this.getCachedSession();
    if (cached && cached.uid === user.uid) return cached;

    const firestore = this.getRequiredDb();
    const staffRecordPath = staffUserPath(user.uid);

    // STEP 1 — staffUsers/{uid}
    const staffSnap = await this.readDoc(
      doc(firestore, COLLECTIONS.staffUsers, user.uid),
      staffRecordPath,
      "STAFF_NOT_FOUND"
    );

    if (!staffSnap.exists()) {
      throw staffError("STAFF_NOT_FOUND", {
        path: staffRecordPath,
        detail: "staffUsers document does not exist for the authenticated uid",
      });
    }

    const validation = validateStaffRecord(staffSnap.data());
    if (!validation.ok) {
      if (validation.reason === "inactive") {
        throw staffError("STAFF_INACTIVE", {
          path: staffRecordPath,
          detail: `staffUsers.status=${validation.status ?? "(unset)"}`,
        });
      }
      throw staffError("STAFF_NO_CLIENT", {
        path: staffRecordPath,
        detail: `staffUsers.${validation.reason}`,
      });
    }

    const clientId = validation.clientId as string;
    if (validation.notes.length > 0 && process.env.NODE_ENV !== "production") {
      console.info("[staff-auth] staffUsers notes:", validation.notes.join(" · "));
    }

    // STEP 2 — clients/{clientId} for the assigned business only
    const clientRecord = await this.loadClientConfig(clientId);

    const staffUser = buildStaffUser(user.uid, staffSnap.data(), {
      displayName: user.displayName,
      email: user.email,
    });
    staffUser.clientId = clientId;

    const session: StaffSession = {
      firebaseUser: { uid: user.uid, email: user.email, displayName: user.displayName },
      uid: user.uid,
      staffRecord: staffUser,
      clientId,
      clientRecord,
    };

    this.sessionCache = { uid: user.uid, session, expiresAt: Date.now() + SESSION_CACHE_TTL_MS };
    return session;
  }

  /** clients/{clientId} → ClientConfig (nested `loyalty` schema + legacy flat fields). */
  static async loadClientConfig(clientId: string): Promise<ClientConfig> {
    const firestore = this.getRequiredDb();
    const cleanClientId = assertSafeSegment(clientId, "clientId");
    const path = `${COLLECTIONS.clients}/${cleanClientId}`;

    const snapshot = await this.readDoc(
      doc(firestore, COLLECTIONS.clients, cleanClientId),
      path,
      "CLIENT_NOT_FOUND"
    );

    if (!snapshot.exists()) {
      throw staffError("CLIENT_NOT_FOUND", {
        path,
        detail: "clients/{clientId} referenced by staffUsers does not exist",
      });
    }

    const config = buildClientConfig(cleanClientId, snapshot.data());
    if (!config.name || !config.slug) {
      throw staffError("CLIENT_CONFIG_INVALID", {
        path,
        detail: "client document has no usable name/slug",
      });
    }
    return config;
  }

  /** Refreshes the cached session (used after staff/business config changes). */
  static async refreshClientConfig(): Promise<ClientConfig> {
    const session = await this.requireSession();
    const clientRecord = await this.loadClientConfig(session.clientId);
    this.sessionCache = {
      uid: session.uid,
      session: { ...session, clientRecord },
      expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
    };
    return clientRecord;
  }

  /** The canonical session — every screen uses this instead of deriving its own. */
  static async getSession(): Promise<StaffSession> {
    const auth = this.getRequiredAuth();
    const user = auth.currentUser;
    if (!user) throw staffError("AUTH_REQUIRED");

    const cached = this.getCachedSession();
    let session: StaffSession;
    if (cached?.uid === user.uid) {
      session = cached;
    } else {
      // Never reuse a previous user's cached business if Auth changed before a
      // component/listener got its cleanup event.
      this.sessionCache = null;
      session = await this.resolveSession(user);
    }

    if (
      auth.currentUser?.uid !== user.uid ||
      !isClientReadySession(session, user.uid)
    ) {
      throw staffError("AUTH_REQUIRED", {
        path: staffUserPath(user.uid),
        detail: "Firebase Auth changed before the canonical staff client session became ready",
      });
    }
    return session;
  }

  private static async requireSession(): Promise<StaffSession> {
    return this.getSession();
  }

  /* ------------------------------------------------------------------ *
   * Customer lookup
   * ------------------------------------------------------------------ */

  /**
   * Customer directory — ALWAYS scoped to the authenticated staff clientId.
   * Firestore rules are not filters, so the query itself pins `clientId`.
   */
  static async getCustomers(
    options: { search?: string; limit?: number } = {}
  ): Promise<CustomerProfile[]> {
    const session = await this.requireSession();
    const firestore = this.getRequiredDb();
    const clientId = session.clientId;
    const cap = Math.min(Math.max(options.limit ?? CUSTOMER_DIRECTORY_LIMIT, 1), 100);
    const term = options.search?.trim() ?? "";

    const docs = term
      ? await this.searchCustomerDocs(firestore, clientId, term, cap)
      : await this.browseCustomerDocs(firestore, clientId, cap);

    return this.hydrateCustomers(firestore, clientId, session.clientRecord, docs);
  }

  /** customers/{customerId} (or code / uid / phone) for the assigned business. */
  static async getCustomerById(customerIdOrCode: string): Promise<CustomerProfile> {
    const session = await this.requireSession();
    return this.loadCustomerById(customerIdOrCode.trim(), session.clientId, session.clientRecord);
  }

  /**
   * QR flow:
   *   payload → customerTokens/{token} → verify token.clientId === staffClientId
   *           → customers/{customerId} → verify customer.clientId === staffClientId
   * The QR payload can never widen access: a canonical token that belongs to
   * another business is rejected before any customer data is read.
   */
  static async scanCustomerQr(rawPayload: string): Promise<CustomerProfile> {
    const session = await this.requireSession();
    const firestore = this.getRequiredDb();
    const clientId = session.clientId;
    const parsed = parseCustomerQrPayload(rawPayload);

    if (!parsed.ok) {
      throw staffError("INVALID_QR", {
        detail: `payload rejected locally (${parsed.reason})`,
      });
    }

    const payload = parsed.payload;

    // Slug hint: purely diagnostic, NEVER authorization. It only helps report
    // the exact reason when the token read itself is denied below (a pass
    // printed for another store names that store in its URL).
    const knownSlugs = [session.clientRecord.slug, session.clientId]
      .filter(Boolean)
      .map((value) => value.toLowerCase());
    const slugNamesAnotherBusiness = payload.clientSlugHint
      ? !knownSlugs.includes(payload.clientSlugHint.toLowerCase())
      : false;

    const tokenPath = customerTokenPath(payload.token);
    let tokenData: UnknownRecord | null = null;
    let tokenMissing = false;

    try {
      const tokenSnap = await getDoc(
        doc(firestore, COLLECTIONS.customerTokens, assertSafeSegment(payload.token, "token"))
      );
      if (tokenSnap.exists()) {
        tokenData = tokenSnap.data();
      } else {
        tokenMissing = true;
      }
    } catch (error: unknown) {
      if (isPermissionDeniedError(error)) {
        // The canonical ruleset allows a staff member to read a
        // customerTokens document only when it belongs to the business on
        // their staff record (a token that does not exist is denied as well).
        // The QR's own business slug decides which of the two this is; it is a
        // hint, so a matching slug is never treated as proof of ownership.
        if (slugNamesAnotherBusiness) {
          throw staffError("CROSS_BUSINESS", {
            path: tokenPath,
            detail: `customerTokens read denied and the QR names "${payload.clientSlugHint}"`,
          });
        }
        console.error(
          `[staff-scan] read denied at ${tokenPath} (${readErrorCode(error)}). ` +
            "Either the token is missing/rotated, or the deployed ruleset does not include the customerTokens block."
        );
        if (!payload.allowCustomerIdFallback) {
          throw staffError("INVALID_QR", {
            path: tokenPath,
            detail:
              "customerTokens read denied and the QR does not name another business " +
              "(token missing/rotated, or the deployed ruleset lacks the customerTokens block)",
          });
        }
        tokenMissing = true;
      } else if (!payload.allowCustomerIdFallback) {
        throw toStaffServiceError(error, "INVALID_QR", { path: tokenPath });
      } else {
        tokenMissing = true;
      }
    }

    if (tokenData) {
      const tokenClientId = stringValue(tokenData.clientId);
      if (!tokenClientId || tokenClientId.toLowerCase() !== clientId.toLowerCase()) {
        throw staffError("CROSS_BUSINESS", {
          path: tokenPath,
          detail: "customerTokens.clientId does not match the authenticated staff clientId",
        });
      }
      const tokenCustomerId = stringValue(tokenData.customerId);
      if (!tokenCustomerId) {
        throw staffError("TOKEN_NOT_LINKED", { path: tokenPath });
      }
      return this.loadCustomerById(tokenCustomerId, clientId, session.clientRecord);
    }

    // Token not found: only legacy passes that encoded a customer document id
    // may fall back to customers/{id} — and only for the assigned business.
    if (tokenMissing && payload.allowCustomerIdFallback) {
      return this.loadCustomerById(payload.token, clientId, session.clientRecord, { quiet: true });
    }

    if (tokenMissing) {
      throw staffError("INVALID_QR", {
        path: tokenPath,
        detail: "customerTokens/{token} does not exist",
      });
    }

    throw staffError("INVALID_QR", { path: tokenPath });
  }

  /* ------------------------------------------------------------------ *
   * Stamps, visits, loyalty and rewards
   * ------------------------------------------------------------------ */

  /**
   * Adds exactly one normal stamp in a single atomic Firestore transaction.
   *
   * Firestore Rules compare the stored lastStampAt with request.time, so the
   * exact 12-hour eligibility check is performed by Firestore's server at
   * commit time (not by the browser clock). The transaction also creates the
   * immutable ledger/activity row, increments visits and loyalty, and writes
   * notifications; any denied write leaves every document unchanged.
   */
  static async addStamp(
    customerId: string,
    idempotencyTxId?: string,
    notes?: string
  ): Promise<StampTransactionResult> {
    const session = await this.requireSession();
    const authenticatedUid = this.getRequiredAuth().currentUser?.uid;
    if (!authenticatedUid || authenticatedUid !== session.uid) {
      throw staffError("AUTH_REQUIRED", { detail: "Firebase Auth changed before the stamp transaction" });
    }

    const clientId = session.clientId;
    const cleanCustomerId = assertSafeSegment(customerId, "customerId");
    const transactionId = this.createTransactionId("stamp", idempotencyTxId);
    const firestore = this.getRequiredDb();

    const staffRef = doc(firestore, COLLECTIONS.staffUsers, authenticatedUid);
    const clientRef = doc(firestore, COLLECTIONS.clients, clientId);
    const customerRef = doc(firestore, COLLECTIONS.customers, cleanCustomerId);
    const loyaltyRef = doc(firestore, COLLECTIONS.loyaltyAccounts, cleanCustomerId);
    const transactionRef = doc(
      firestore,
      COLLECTIONS.clients,
      clientId,
      SUBCOLLECTIONS.stampTransactions,
      transactionId
    );
    const stampNotificationRef = doc(
      firestore,
      COLLECTIONS.clients,
      clientId,
      SUBCOLLECTIONS.notifications,
      `${transactionId}_stamp`
    );
    const rewardNotificationRef = doc(
      firestore,
      COLLECTIONS.clients,
      clientId,
      SUBCOLLECTIONS.notifications,
      `${transactionId}_reward_ready`
    );

    // Historical ledgers are immutable. Their count is a lower bound used to
    // repair lifetime counters; failure to read history never blocks a valid
    // stamp, and the Firestore transaction still re-reads all mutable records.
    const historicalCounts = await this.loadHistoricalLoyaltyCounts(
      firestore,
      clientId,
      cleanCustomerId
    );

    const transactionPath = `${stampTransactionsPath(clientId)}/${transactionId}`;
    const trace: FirestoreRequestTrace = {
      operation: "runTransaction",
      path: transactionPath,
      sessionUid: authenticatedUid,
      clientId,
      constraints: [
        `read staffUsers/${authenticatedUid}`,
        `verify staffUsers/${authenticatedUid}.clientId == ${clientId}`,
        `read clients/${clientId}`,
        `read customers/${cleanCustomerId}`,
        `read loyaltyAccounts/${cleanCustomerId}`,
        "read idempotency ledger",
        "atomically create stamp activity, visit count, loyalty balance, and notifications",
        `Firestore Rules require request.time >= lastStampAt + ${STAMP_COOLDOWN_MS}ms`,
      ],
      rule: "one transaction; Firestore Rules enforce lastStampAt + duration.value(12, 'h') <= request.time",
    };
    this.traceFirestoreRequest(trace);

    let outcome: StampTransactionOutcome;
    try {
      outcome = await runTransaction(firestore, async (transaction) => {
        // Resolve the business again inside the transaction from the signed-in
        // UID's canonical registry document. A stale URL/session cannot select
        // another business or bypass a staff reassignment.
        const staffSnap = await transaction.get(staffRef);
        if (!staffSnap.exists()) {
          throw staffError("STAFF_NOT_FOUND", { path: `staffUsers/${authenticatedUid}` });
        }
        const staffData = staffSnap.data();
        const validation = validateStaffRecord(staffData);
        if (!validation.ok) {
          throw staffError(
            validation.reason === "inactive" ? "STAFF_INACTIVE" : "STAFF_NO_CLIENT",
            { path: `staffUsers/${authenticatedUid}` }
          );
        }
        if (validation.clientId !== clientId) {
          throw staffError("CROSS_BUSINESS", {
            path: `staffUsers/${authenticatedUid}`,
            detail: "the authenticated staff record no longer resolves to the active session business",
          });
        }

        const clientSnap = await transaction.get(clientRef);
        if (!clientSnap.exists()) {
          throw staffError("CLIENT_NOT_FOUND", { path: `${COLLECTIONS.clients}/${clientId}` });
        }
        const clientConfig = buildClientConfig(clientId, clientSnap.data());
        if (!clientConfig.loyaltyEnabled) {
          throw staffError("LOYALTY_DISABLED", { path: `${COLLECTIONS.clients}/${clientId}.loyalty` });
        }

        const customerSnap = await transaction.get(customerRef);
        if (!customerSnap.exists()) {
          throw staffError("CUSTOMER_NOT_FOUND", { path: customerPath(cleanCustomerId) });
        }
        const customerData = customerSnap.data();
        this.assertClientOwnership(customerData.clientId, clientId, customerPath(cleanCustomerId));

        const loyaltySnap = await transaction.get(loyaltyRef);
        const loyaltyData = loyaltySnap.exists() ? loyaltySnap.data() : undefined;
        if (loyaltyData) {
          this.assertClientOwnership(
            loyaltyData.clientId,
            clientId,
            loyaltyAccountPath(cleanCustomerId)
          );
          if (!resolveLoyaltyState(cleanCustomerId, clientId, loyaltyData).belongsToClient) {
            throw staffError("CROSS_BUSINESS", { path: loyaltyAccountPath(cleanCustomerId) });
          }
        }

        const existingTxSnap = await transaction.get(transactionRef);
        if (existingTxSnap.exists()) {
          const existing = existingTxSnap.data();
          this.assertClientOwnership(existing.clientId, clientId, transactionPath);
          if (
            String(existing.customerId) !== cleanCustomerId ||
            stringValue(existing.transactionId) !== transactionId ||
            stringValue(existing.type) !== "STAMP_ADDED" ||
            stringValue(existing.staffId) !== authenticatedUid ||
            stringValue(existing.staffUid) !== authenticatedUid ||
            existing.visitCounted === false
          ) {
            throw staffError("DUPLICATE_OPERATION", {
              path: transactionPath,
              detail: "the idempotency key belongs to another or incomplete operation",
            });
          }

          return {
            previousStamps: nonNegativeInt(existing.stampCountBefore),
            newStamps: nonNegativeInt(existing.stampCountAfter),
            stampTarget: resolveStampTarget(existing.stampTarget, clientConfig.stampTarget),
            rewardUnlocked: existing.rewardUnlocked === true,
            rewardName: firstString(existing.rewardName, clientConfig.rewardName) as string,
            customerId: cleanCustomerId,
            customerName:
              firstString(existing.customerName, customerData.name, customerData.displayName) || "Customer",
            replayed: true,
          } satisfies StampTransactionOutcome;
        }

        const previousStamps = loyaltyData
          ? resolveLoyaltyState(cleanCustomerId, clientId, loyaltyData).stamps
          : 0;
        const stampTarget = clientConfig.stampTarget;
        const rewardName = clientConfig.rewardName;
        const newStamps = nextStampBalance(previousStamps);
        const rewardUnlocked = newStamps >= stampTarget;
        const customerName = firstString(customerData.name, customerData.displayName) || "Customer";
        const customerCode = firstString(
          customerData.customerCode,
          customerData.code,
          customerData.displayId
        );
        const staffName = buildStaffUser(authenticatedUid, staffData, {
          displayName: session.firebaseUser.displayName,
          email: session.firebaseUser.email,
        }).name;

        const rewardsRedeemed = Math.max(
          nonNegativeInt(loyaltyData?.rewardsRedeemed),
          nonNegativeInt(loyaltyData?.totalRewardsRedeemed),
          historicalCounts.redemptionCount ?? 0
        );
        const previousRewardsEarned = Math.max(
          nonNegativeInt(loyaltyData?.rewardsEarned),
          nonNegativeInt(loyaltyData?.totalRewardsEarned),
          rewardsRedeemed
        );
        // Repair a missing earned counter for an already-ready legacy account,
        // but only count the reward once until the current balance is redeemed.
        const rewardJustUnlocked =
          (previousStamps < stampTarget && rewardUnlocked) ||
          (previousStamps >= stampTarget && previousRewardsEarned === rewardsRedeemed);
        const rewardsEarned = previousRewardsEarned + (rewardJustUnlocked ? 1 : 0);
        const lifetimeStamps =
          reconcileLifetimeStamps(
            previousStamps,
            loyaltyData?.lifetimeStamps,
            historicalCounts.stampCount
          ) + 1;
        const nextVisits = visitBaseline(customerData.totalVisits) + 1;

        // One successful stamp has one immutable history/activity record.
        transaction.set(transactionRef, {
          clientId,
          customerId: cleanCustomerId,
          transactionId,
          staffId: authenticatedUid,
          staffUid: authenticatedUid,
          staffName,
          actorType: "STAFF",
          actorName: staffName,
          type: "STAMP_ADDED",
          title: "Stamp Added",
          description: customerCode ? `${customerName} #${customerCode}` : customerName,
          reason: notes?.trim() || "Visit stamp (counter)",
          delta: 1,
          addedCount: 1,
          customerName,
          customerCode: customerCode ?? null,
          visitCounted: true,
          visitCountedAt: serverTimestamp(),
          stampCountBefore: previousStamps,
          stampCountAfter: newStamps,
          stampTarget,
          rewardName,
          rewardUnlocked,
          notes: notes?.trim() || "Standard loyalty stamp",
          createdAt: serverTimestamp(),
        });

        transaction.update(customerRef, {
          totalVisits: nextVisits,
          lastVisitAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastVisitTransactionId: transactionId,
        });

        transaction.set(
          loyaltyRef,
          {
            clientId,
            customerId: cleanCustomerId,
            currentStamps: newStamps,
            // Keep the existing alias for the Customer app/reward architecture.
            stamps: newStamps,
            lifetimeStamps,
            rewardsEarned,
            rewardsRedeemed,
            totalRewardsEarned: rewardsEarned,
            totalRewardsRedeemed: rewardsRedeemed,
            stampTarget,
            rewardName,
            isEligibleForReward: rewardUnlocked,
            lastStampAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        const notificationMetadata = {
          transactionId,
          stamps: newStamps,
          stampTarget,
          staffUid: authenticatedUid,
          staffName,
          createdBy: "STAFF_APP",
        };
        transaction.set(stampNotificationRef, {
          clientId,
          type: "STAMP_ADDED",
          title: "Stamp added",
          message: `${customerName} received 1 stamp (${newStamps}/${stampTarget}).`,
          customerId: cleanCustomerId,
          read: false,
          staffUid: authenticatedUid,
          metadata: notificationMetadata,
          createdAt: serverTimestamp(),
        });

        if (rewardJustUnlocked) {
          transaction.set(rewardNotificationRef, {
            clientId,
            type: "REWARD_READY",
            title: "Reward ready",
            message: `${customerName} is ready for ${rewardName}.`,
            customerId: cleanCustomerId,
            read: false,
            staffUid: authenticatedUid,
            metadata: {
              ...notificationMetadata,
              stamps: newStamps,
              rewardName,
            },
            createdAt: serverTimestamp(),
          });
        }

        return {
          previousStamps,
          newStamps,
          stampTarget,
          rewardUnlocked,
          rewardName,
          customerId: cleanCustomerId,
          customerName,
          replayed: false,
        } satisfies StampTransactionOutcome;
      });
    } catch (error: unknown) {
      this.traceFirestoreRequest(trace, error);
      if (isPermissionDeniedError(error)) {
        const cooldownError = await this.stampCooldownErrorAfterDeniedWrite(
          loyaltyRef,
          clientId,
          error
        );
        if (cooldownError) throw cooldownError;
      }
      throw toStaffServiceError(error, "UNKNOWN", {
        path: transactionPath,
        detail: "atomic stamp, visit, loyalty and notification transaction",
      });
    }

    const updatedCustomer = await this.loadCustomerById(
      cleanCustomerId,
      clientId,
      session.clientRecord,
      {
        quiet: true,
        historicalCounts:
          historicalCounts.stampCount === undefined
            ? historicalCounts
            : {
                ...historicalCounts,
                stampCount: historicalCounts.stampCount + (outcome.replayed ? 0 : 1),
              },
      }
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
      replayed: outcome.replayed,
    };
  }

  /**
   * Maps a server rule denial to a friendly cooldown response when the latest
   * canonical loyalty timestamp shows the cooldown is still pending. The local
   * clock is used only to estimate the message; the actual allow/deny decision
   * has already been made with Firestore Rules request.time.
   */
  private static async stampCooldownErrorAfterDeniedWrite(
    loyaltyRef: DocumentReference,
    clientId: string,
    cause: unknown
  ): Promise<StampCooldownError | null> {
    try {
      const loyaltySnap = await getDoc(loyaltyRef);
      const loyaltyData = loyaltySnap.exists() ? loyaltySnap.data() : undefined;
      if (loyaltyData && stringValue(loyaltyData.clientId) !== clientId) return null;

      const firestore = this.getRequiredDb();
      const customerSnap = await getDoc(doc(firestore, COLLECTIONS.customers, loyaltyRef.id));
      const customerData = customerSnap.exists() ? customerSnap.data() : undefined;
      if (customerData && stringValue(customerData.clientId) !== clientId) return null;

      const candidates = [
        { value: loyaltyData?.lastStampAt, source: loyaltyAccountPath(loyaltyRef.id) },
        { value: customerData?.lastVisitAt, source: customerPath(loyaltyRef.id) },
      ]
        .map((candidate) => ({ ...candidate, millis: timestampToMillis(candidate.value) }))
        .filter(
          (candidate): candidate is { value: unknown; source: string; millis: number } =>
            candidate.millis !== undefined
        )
        .sort((a, b) => b.millis - a.millis);
      const lastStampAt = candidates[0]?.value;
      const lastStampAtMillis = candidates[0]?.millis;
      const lastStampPath = candidates[0]?.source || loyaltyAccountPath(loyaltyRef.id);
      if (lastStampAtMillis === undefined) return null;
      const cooldown = getStampCooldownState(lastStampAtMillis, Date.now());
      if (cooldown.nextStampAtMillis === undefined) return null;

      // This remaining-time value is display-only. If the local clock says the
      // window elapsed but Firestore denied the commit, surface the structured
      // server rejection without pretending the browser clock can overrule it.
      const nextStampAt = Timestamp.fromMillis(cooldown.nextStampAtMillis);
      const message =
        cooldown.remainingMs > 0
          ? `Stamp already added recently. Next stamp available in ${formatCooldownRemaining(cooldown.remainingMs)}.`
          : "Firestore rejected the 12-hour stamp cooldown check. Refresh and try again.";
      return new StampCooldownError({
        lastStampAt,
        nextStampAt,
        remainingMs: cooldown.remainingMs,
        message,
        technical: {
          code: readErrorCode(cause) || "permission-denied",
          path: lastStampPath,
          detail: "Firestore Rules rejected the write during the 12-hour request.time cooldown",
        },
      });
    } catch (error: unknown) {
      if (error instanceof StampCooldownError) return error;
      // This is intentionally best-effort. Never replace the original safe
      // permission/network mapping with a secondary lookup failure.
      return null;
    }
  }

  /**
   * Redeems the reward atomically: the redemption document is both the record
   * and the idempotency key, and the same transaction appends the activity row.
   */
  static async redeemReward(
    customerId: string,
    idempotencyTxId?: string
  ): Promise<RewardRedemptionResult> {
    const session = await this.requireSession();
    const clientId = session.clientId;
    const clientConfig = session.clientRecord;

    if (!clientConfig.loyaltyEnabled) {
      throw staffError("LOYALTY_DISABLED", { path: `${COLLECTIONS.clients}/${clientId}.loyalty` });
    }

    const cleanCustomerId = assertSafeSegment(customerId, "customerId");
    const redemptionId = this.createTransactionId("reward", idempotencyTxId);
    const firestore = this.getRequiredDb();
    const historicalCounts = await this.loadHistoricalLoyaltyCounts(
      firestore,
      clientId,
      cleanCustomerId
    );

    const redemptionRef = doc(
      firestore,
      COLLECTIONS.clients,
      clientId,
      SUBCOLLECTIONS.rewardRedemptions,
      redemptionId
    );
    const activityRef = doc(
      firestore,
      COLLECTIONS.clients,
      clientId,
      SUBCOLLECTIONS.stampTransactions,
      redemptionId
    );
    const customerRef = doc(firestore, COLLECTIONS.customers, cleanCustomerId);
    const loyaltyRef = doc(firestore, COLLECTIONS.loyaltyAccounts, cleanCustomerId);

    const redemptionPath = `${rewardRedemptionsPath(clientId)}/${redemptionId}`;
    const redemptionTrace: FirestoreRequestTrace = {
      operation: "runTransaction",
      path: redemptionPath,
      sessionUid: session.uid,
      clientId,
      constraints: [
        `read customers/${cleanCustomerId}`,
        `read loyaltyAccounts/${cleanCustomerId}`,
        "create one rewardRedemptions record and matching activity record",
        "reset loyalty only when the configured stamp target is reached",
      ],
      rule: "clients/{clientId}/rewardRedemptions/{redemptionId} -> authenticated staff, same-business customer, eligible loyalty, create-only",
    };
    this.traceFirestoreRequest(redemptionTrace);
    let outcome: RedemptionOutcome;
    try {
      outcome = await runTransaction(firestore, async (transaction) => {
        const customerSnap = await transaction.get(customerRef);
        const loyaltySnap = await transaction.get(loyaltyRef);
        const redemptionSnap = await transaction.get(redemptionRef);
        const activitySnap = await transaction.get(activityRef);

        if (!customerSnap.exists()) {
          throw staffError("CUSTOMER_NOT_FOUND", { path: customerPath(cleanCustomerId) });
        }
        const customerData = customerSnap.data();
        this.assertClientOwnership(
          customerData.clientId,
          clientId,
          customerPath(cleanCustomerId)
        );
        const customerName = firstString(customerData.name, customerData.displayName) || "Customer";
        const customerCode = firstString(
          customerData.customerCode,
          customerData.code,
          customerData.displayId
        );

        if (redemptionSnap.exists()) {
          const existing = redemptionSnap.data();
          this.assertClientOwnership(
            existing.clientId,
            clientId,
            `${rewardRedemptionsPath(clientId)}/${redemptionId}`
          );
          if (
            String(existing.customerId) !== cleanCustomerId ||
            stringValue(existing.transactionId) !== redemptionId ||
            stringValue(existing.staffUid) !== session.uid ||
            stringValue(existing.staffId) !== session.uid
          ) {
            throw staffError("DUPLICATE_OPERATION", {
              path: `${rewardRedemptionsPath(clientId)}/${redemptionId}`,
              detail: "redemption id belongs to another customer, staff member or operation",
            });
          }
          return {
            stampsResetFrom: nonNegativeInt(existing.stampsResetFrom),
            stampsResetTo: nonNegativeInt(existing.stampsResetTo),
            rewardName: firstString(existing.rewardName) || clientConfig.rewardName,
            customerId: cleanCustomerId,
            customerName,
            replayed: true,
          } satisfies RedemptionOutcome;
        }

        if (!loyaltySnap.exists()) {
          throw staffError("NOT_ELIGIBLE", {
            path: loyaltyAccountPath(cleanCustomerId),
            detail: "no loyalty account for this customer yet",
          });
        }

        const loyaltyData = loyaltySnap.data();
        this.assertClientOwnership(loyaltyData.clientId, clientId, loyaltyAccountPath(cleanCustomerId));
        const loyaltyState = resolveLoyaltyState(cleanCustomerId, clientId, loyaltyData);
        if (!loyaltyState.belongsToClient) {
          throw staffError("CROSS_BUSINESS", { path: loyaltyAccountPath(cleanCustomerId) });
        }

        if (activitySnap.exists()) {
          throw staffError("DUPLICATE_OPERATION", {
            path: `${stampTransactionsPath(clientId)}/${redemptionId}`,
            detail: "transaction id already used for another operation",
          });
        }

        const stampTarget = clientConfig.stampTarget;
        const rewardName = clientConfig.rewardName;
        const currentStamps = loyaltyState.stamps;

        if (!isRewardRedeemable(currentStamps, stampTarget)) {
          throw staffError("NOT_ELIGIBLE", {
            detail: `customer has ${currentStamps}/${stampTarget} stamps`,
          });
        }

        const remainingStamps = remainingStampsAfterRedemption(currentStamps, stampTarget);
        const previousRewards = Math.max(
          nonNegativeInt(loyaltyData.rewardsRedeemed),
          nonNegativeInt(loyaltyData.totalRewardsRedeemed),
          historicalCounts.redemptionCount ?? 0
        );
        const rewardsRedeemed = previousRewards + 1;
        const rewardsEarned = Math.max(
          nonNegativeInt(loyaltyData.rewardsEarned),
          nonNegativeInt(loyaltyData.totalRewardsEarned),
          rewardsRedeemed
        );
        const lifetimeStamps = reconcileLifetimeStamps(
          currentStamps,
          loyaltyData.lifetimeStamps,
          historicalCounts.stampCount
        );

        transaction.set(redemptionRef, {
          clientId,
          customerId: cleanCustomerId,
          customerName,
          customerCode: customerCode ?? null,
          rewardName,
          stampCost: stampTarget,
          stampsResetFrom: currentStamps,
          stampsResetTo: remainingStamps,
          staffUid: session.uid,
          staffId: session.uid,
          staffName: session.staffRecord.name,
          actorType: "STAFF",
          actorName: session.staffRecord.name,
          transactionId: redemptionId,
          redeemedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });

        transaction.set(activityRef, {
          clientId,
          customerId: cleanCustomerId,
          transactionId: redemptionId,
          staffId: session.uid,
          staffUid: session.uid,
          staffName: session.staffRecord.name,
          actorType: "STAFF",
          actorName: session.staffRecord.name,
          type: "REWARD_REDEEMED",
          title: "Reward Redeemed",
          rewardName,
          description: customerCode
            ? `${rewardName} • ${customerName} #${customerCode}`
            : `${rewardName} • ${customerName}`,
          reason: `${rewardName} redeemed`,
          delta: -stampTarget,
          customerName,
          customerCode: customerCode ?? null,
          badgeText: "Gift",
          badgeType: "reward",
          visitCounted: false,
          createdAt: serverTimestamp(),
        });

        transaction.set(
          loyaltyRef,
          {
            clientId,
            customerId: cleanCustomerId,
            currentStamps: remainingStamps,
            // Preserve the legacy balance alias used by existing Customer app readers.
            stamps: remainingStamps,
            lifetimeStamps,
            rewardsEarned,
            rewardsRedeemed,
            totalRewardsEarned: rewardsEarned,
            totalRewardsRedeemed: rewardsRedeemed,
            isEligibleForReward: remainingStamps >= stampTarget,
            lastRewardRedemptionId: redemptionId,
            lastRewardRedeemedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        return {
          stampsResetFrom: currentStamps,
          stampsResetTo: remainingStamps,
          rewardName,
          customerId: cleanCustomerId,
          customerName,
          replayed: false,
        } satisfies RedemptionOutcome;
      });
    } catch (error: unknown) {
      this.traceFirestoreRequest(redemptionTrace, error);
      throw toStaffServiceError(error, "UNKNOWN", {
        path: redemptionPath,
        detail: "redeem loyalty reward",
      });
    }

    const updatedCustomer = await this.loadCustomerById(
      cleanCustomerId,
      clientId,
      clientConfig,
      { quiet: true, historicalCounts }
    );

    if (!outcome.replayed) {
      await this.emitNotifications(clientId, session, [
        {
          id: `${redemptionId}_redeemed`,
          type: "REWARD_REDEEMED",
          title: "Reward redeemed",
          message: `${outcome.rewardName} redeemed for ${outcome.customerName}.`,
          customerId: cleanCustomerId,
          metadata: {
            transactionId: redemptionId,
            rewardName: outcome.rewardName,
            stampsResetFrom: outcome.stampsResetFrom,
            stampsResetTo: outcome.stampsResetTo,
            staffUid: session.uid,
          },
        },
      ]);
    }

    return {
      success: true,
      transactionId: redemptionId,
      stampsResetFrom: outcome.stampsResetFrom,
      stampsResetTo: outcome.stampsResetTo,
      rewardName: outcome.rewardName,
      customer: updatedCustomer,
      message: `Reward "${outcome.rewardName}" successfully redeemed for ${updatedCustomer.name}!`,
      replayed: outcome.replayed,
    };
  }

  /* ------------------------------------------------------------------ *
   * Live listeners
   * ------------------------------------------------------------------ */

  /** Latest ledger entries for the assigned business only. */
  static listenToRecentActivity(
    callback: (items: StaffActivityItem[]) => void,
    onError?: (error: StaffServiceError) => void
  ): Unsubscribe {
    return this.withSession(
      (session) => {
        const firestore = this.getRequiredDb();
        const activitiesQuery = query(
          collection(firestore, COLLECTIONS.clients, session.clientId, SUBCOLLECTIONS.stampTransactions),
          orderBy("createdAt", "desc"),
          limit(ACTIVITY_LIMIT)
        );

        return onSnapshot(
          activitiesQuery,
          (snapshot) => {
            callback(
              snapshot.docs
                .map((activityDoc) => this.toActivityItem(activityDoc.id, activityDoc.data(), session.clientId))
                .filter((item): item is StaffActivityItem => item !== null)
            );
          },
          (error: unknown) => {
            const staffErr = this.mapListenerError(error, stampTransactionsPath(session.clientId));
            console.warn("[staff-activity] listener notice:", describeErrorForDiagnostics(staffErr));
            onError?.(staffErr);
          }
        );
      },
      onError
    );
  }

  /**
   * Dashboard metrics — all from Firestore, scoped to the assigned clientId.
   * `reviewsAvailable === false` means the metric could not be read (rules or
   * network); the UI then shows an em dash instead of a fake number.
   */
  static listenToDashboardStats(
    callback: (stats: DashboardStats) => void,
    onError?: (error: StaffServiceError) => void
  ): Unsubscribe {
    return this.withSession(
      (session) => {
        const firestore = this.getRequiredDb();
        const clientId = session.clientId;
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        let cancelled = false;
        let todayStamps = 0;
        let stampsAvailable = false;
        let todayCustomers: number | null = null;
        let customersAvailable = false;
        let rewardsRedeemed = 0;
        let rewardsAvailable = false;
        let reviews = 0;
        let reviewsAvailable = false;
        let loadedAt: string | undefined;
        const metricErrors: Record<"stamps" | "customers" | "rewards" | "reviews", string | undefined> = {
          stamps: undefined,
          customers: undefined,
          rewards: undefined,
          reviews: undefined,
        };

        const emit = () => {
          if (cancelled) return;
          loadedAt = new Date().toISOString();
          callback({
            todayStamps,
            todayCustomers,
            todayReviews: reviews,
            rewardsRedeemed,
            stampsAvailable,
            reviewsAvailable,
            customersAvailable,
            rewardsAvailable,
            errorMessage: Object.values(metricErrors).find((message) => Boolean(message)),
            loadedAt,
          });
        };

        const reportMetricError = (
          metric: keyof typeof metricErrors,
          error: unknown,
          path: string,
          request: FirestoreRequestTrace,
          fallback: Parameters<typeof toStaffServiceError>[1] = "UNKNOWN"
        ) => {
          if (cancelled) return;
          const staffErr = this.mapListenerError(error, path, fallback);
          metricErrors[metric] = staffErr.message;
          if (metric === "stamps") stampsAvailable = false;
          if (metric === "customers") customersAvailable = false;
          if (metric === "rewards") rewardsAvailable = false;
          if (metric === "reviews") reviewsAvailable = false;
          this.traceFirestoreRequest(request, error);
          onError?.(staffErr);
          emit();
        };

        // Today's stamps: the business's OWN ledger, queried for entries
        // created since local midnight. Reward redemptions share the ledger
        // and are excluded by isStampLedgerEntry().
        const stampsPath = stampTransactionsPath(clientId);
        const stampsQuery = query(
          collection(firestore, COLLECTIONS.clients, clientId, SUBCOLLECTIONS.stampTransactions),
          where("createdAt", ">=", startOfToday),
          orderBy("createdAt", "desc"),
          limit(TODAY_LEDGER_LIMIT)
        );
        const stampsTrace = {
          operation: "onSnapshot",
          path: stampsPath,
          clientId,
          constraints: ["createdAt >= local midnight"],
          orderBy: "createdAt desc",
          limit: TODAY_LEDGER_LIMIT,
          rule: "clients/{clientId}/stampTransactions/{transactionId} -> isStaffOf(clientId)",
        };
        this.traceFirestoreRequest(stampsTrace);

        const unsubStamps = onSnapshot(
          stampsQuery,
          (snapshot) => {
            if (cancelled) return;
            todayStamps = snapshot.docs.filter((activityDoc) =>
              isStampLedgerEntry(activityDoc.data())
            ).length;
            stampsAvailable = true;
            metricErrors.stamps = undefined;
            emit();
          },
          (error: unknown) =>
            reportMetricError("stamps", error, stampsPath, stampsTrace)
        );

        // Customers who joined TODAY. Both the query and its Security Rules
        // predicate are pinned to the canonical staff clientId. This query
        // requires clients ASC + createdAt ASC in firestore.indexes.json.
        const customersQuery = buildTodayCustomersCountQuery(firestore, clientId, startOfToday);
        const customersTrace = {
          operation: "getCountFromServer",
          path: COLLECTIONS.customers,
          clientId,
          constraints: [
            `clientId == ${clientId}`,
            "createdAt >= local midnight",
            "createdAt < next local midnight",
          ],
          orderBy: "createdAt asc (range-field order)",
          index: "customers: clientId ASC, createdAt ASC",
          rule: "match /customers/{customerId} -> allow list when clientId == staffClientId()",
        };
        this.traceFirestoreRequest(customersTrace);
        void getCountFromServer(customersQuery)
          .then((snapshot) => {
            if (cancelled) return;
            todayCustomers = snapshot.data().count;
            customersAvailable = true;
            metricErrors.customers = undefined;
            emit();
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            customersAvailable = false;
            todayCustomers = null;
            reportMetricError("customers", error, COLLECTIONS.customers, customersTrace);
          });

        // Rewards redeemed for the business.
        const rewardsPath = rewardRedemptionsPath(clientId);
        const rewardsQuery = query(
          collection(firestore, COLLECTIONS.clients, clientId, SUBCOLLECTIONS.rewardRedemptions)
        );
        const rewardsTrace = {
          operation: "getCountFromServer",
          path: rewardsPath,
          clientId,
          constraints: [],
          rule: "clients/{clientId}/rewardRedemptions/{redemptionId} -> isStaffOf(clientId)",
        };
        this.traceFirestoreRequest(rewardsTrace);
        void getCountFromServer(rewardsQuery)
          .then((snapshot) => {
            if (cancelled) return;
            rewardsRedeemed = snapshot.data().count;
            rewardsAvailable = true;
            metricErrors.rewards = undefined;
            emit();
          })
          .catch((error: unknown) =>
            reportMetricError("rewards", error, rewardsPath, rewardsTrace)
          );

        // Reviews for the business (read-only for staff).
        const businessReviewsPath = reviewsPath(clientId);
        const reviewsQuery = query(
          collection(firestore, COLLECTIONS.clients, clientId, SUBCOLLECTIONS.reviews)
        );
        const reviewsTrace = {
          operation: "getCountFromServer",
          path: businessReviewsPath,
          clientId,
          constraints: [],
          rule: "clients/{clientId}/reviews/{reviewId} -> isStaffOf(clientId)",
        };
        this.traceFirestoreRequest(reviewsTrace);
        void getCountFromServer(reviewsQuery)
          .then((snapshot) => {
            if (cancelled) return;
            reviews = snapshot.data().count;
            reviewsAvailable = true;
            metricErrors.reviews = undefined;
            emit();
          })
          .catch((error: unknown) => {
            if (cancelled) return;
            reviewsAvailable = false;
            reportMetricError("reviews", error, businessReviewsPath, reviewsTrace);
          });

        return () => {
          cancelled = true;
          unsubStamps();
        };
      },
      onError
    );
  }

  /** clients/{clientId}/notifications — real business events, live. */
  static listenToNotifications(
    callback: (items: StaffNotification[]) => void,
    onError?: (error: StaffServiceError) => void
  ): Unsubscribe {
    return this.withSession(
      (session) => {
        const firestore = this.getRequiredDb();
        const notificationsQuery = buildNotificationsListenerQuery(
          firestore,
          session.clientId,
          NOTIFICATION_LIMIT
        );
        const trace = {
          operation: "onSnapshot",
          path: notificationsPath(session.clientId),
          sessionUid: session.uid,
          clientId: session.clientId,
          // Business scope is encoded in the collection path; there is no global
          // notifications collection or client-side post-filter.
          constraints: [],
          orderBy: "createdAt desc",
          limit: NOTIFICATION_LIMIT,
          rule: "clients/{clientId}/notifications/{notificationId} -> allow read if isStaffOf(clientId)",
        } satisfies FirestoreRequestTrace;
        this.traceFirestoreRequest(trace);

        return onSnapshot(
          notificationsQuery,
          (snapshot) => {
            callback(
              snapshot.docs.map((item) => this.toNotification(item, session.clientId))
            );
          },
          (error: unknown) => {
            this.traceFirestoreRequest(trace, error);
            const staffErr = this.mapListenerError(
              error,
              notificationsPath(session.clientId),
              "NOTIFICATIONS_UNAVAILABLE"
            );
            console.warn("[staff-notifications] listener notice:", describeErrorForDiagnostics(staffErr));
            onError?.(staffErr);
          }
        );
      },
      onError
    );
  }

  /** Marks a single notification read — the only mutable field. */
  static async markNotificationRead(notificationId: string): Promise<void> {
    const session = await this.requireSession();
    const firestore = this.getRequiredDb();
    const id = assertSafeSegment(notificationId, "notificationId");
    const path = `${notificationsPath(session.clientId)}/${id}`;
    const trace: FirestoreRequestTrace = {
      operation: "updateDoc",
      path,
      sessionUid: session.uid,
      clientId: session.clientId,
      constraints: ["update only: read = true"],
      rule: "clients/{clientId}/notifications/{notificationId} -> update affectedKeys hasOnly(['read'])",
    };
    this.traceFirestoreRequest(trace);
    try {
      await updateDoc(
        doc(firestore, COLLECTIONS.clients, session.clientId, SUBCOLLECTIONS.notifications, id),
        { read: true }
      );
    } catch (error: unknown) {
      this.traceFirestoreRequest(trace, error);
      throw toStaffServiceError(error, "NOTIFICATIONS_UNAVAILABLE", { path });
    }
  }

  /* ------------------------------------------------------------------ *
   * Internals
   * ------------------------------------------------------------------ */

  private static async readDoc(
    reference: DocumentReference,
    path: string,
    notFoundCode: "STAFF_NOT_FOUND" | "CLIENT_NOT_FOUND" | "CUSTOMER_NOT_FOUND"
  ): Promise<DocumentSnapshot> {
    const clientId = path.startsWith(`${COLLECTIONS.clients}/`)
      ? path.split("/")[1]
      : undefined;
    const trace: FirestoreRequestTrace = {
      operation: "getDoc",
      path,
      clientId,
      rule: path.startsWith(`${COLLECTIONS.staffUsers}/`)
        ? "staffUsers/{staffId} -> allow get if request.auth.uid == staffId"
        : "clients/{clientId} -> allow get if public or isStaffOf(clientId)",
    };
    this.traceFirestoreRequest(trace);
    try {
      return await getDoc(reference);
    } catch (error: unknown) {
      this.traceFirestoreRequest(trace, error);
      throw toStaffServiceError(error, "UNKNOWN", {
        path,
        detail: `Firestore ${notFoundCode} document read failed`,
      });
    }
  }

  private static async browseCustomerDocs(
    firestore: Firestore,
    clientId: string,
    cap: number
  ): Promise<QueryDocumentSnapshot[]> {
    const customersQuery = buildCustomerDirectoryQuery(firestore, clientId, cap);
    const trace = {
      operation: "getDocs",
      path: COLLECTIONS.customers,
      clientId,
      constraints: [`clientId == ${clientId}`],
      limit: cap,
      rule: "match /customers/{customerId} -> allow list when clientId == staffClientId()",
    };
    try {
      this.traceFirestoreRequest(trace);
      const snapshot = await getDocs(customersQuery);
      return snapshot.docs;
    } catch (error: unknown) {
      this.traceFirestoreRequest(trace, error);
      throw toStaffServiceError(error, "UNKNOWN", { path: COLLECTIONS.customers });
    }
  }

  /**
   * Search that keeps every Firestore query pinned to the assigned clientId
   * (Security Rules are not filters). Exact ID/code/phone lookups and name
   * prefix lookups are all built by the client-scoped query module. If the
   * name composite index is still building, the fallback only filters a
   * limited page already restricted to this staff member's business.
   */
  private static async searchCustomerDocs(
    firestore: Firestore,
    clientId: string,
    term: string,
    cap: number
  ): Promise<QueryDocumentSnapshot[]> {
    const raw = term.trim();
    const searchCap = Math.min(cap, CUSTOMER_SEARCH_LIMIT);
    const candidates = buildCustomerExactSearchQueries(firestore, clientId, raw, searchCap);
    const seen = new Map<string, QueryDocumentSnapshot>();
    for (const candidate of candidates) {
      this.traceFirestoreRequest({
        operation: "getDocs",
        path: COLLECTIONS.customers,
        clientId,
        constraints: [`clientId == ${clientId}`, `${candidate.kind} == [search value]`],
        limit: searchCap,
        rule: "match /customers/{customerId} -> allow list when clientId == staffClientId()",
      });
    }

    const results = await Promise.allSettled(candidates.map((candidate) => getDocs(candidate.query)));
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      const candidate = candidates[index];
      if (result.status === "rejected") {
        const trace = {
          operation: "getDocs",
          path: COLLECTIONS.customers,
          clientId,
          constraints: [`clientId == ${clientId}`, `${candidate.kind} == [search value]`],
          limit: searchCap,
          rule: "match /customers/{customerId} -> allow list when clientId == staffClientId()",
        };
        this.traceFirestoreRequest(trace, result.reason);
        if (isMissingIndexError(result.reason)) continue;
        throw toStaffServiceError(result.reason, "UNKNOWN", {
          path: COLLECTIONS.customers,
          detail: `customer exact-search query (${candidate.kind})`,
        });
      }
      for (const customerDoc of result.value.docs) seen.set(customerDoc.id, customerDoc);
    }

    if (seen.size > 0) return Array.from(seen.values());

    // Name prefix query (clientId ASC, name ASC composite index).
    const nameTerm = raw.toLowerCase();
    const nameQuery = buildCustomerNamePrefixQuery(firestore, clientId, raw, searchCap);
    const nameTrace = {
      operation: "getDocs",
      path: COLLECTIONS.customers,
      clientId,
      constraints: [
        `clientId == ${clientId}`,
        `name >= ${nameTerm}`,
        `name <= ${nameTerm}\uf8ff`,
      ],
      orderBy: "name asc",
      limit: searchCap,
      rule: "match /customers/{customerId} -> allow list when clientId == staffClientId()",
    };
    try {
      this.traceFirestoreRequest(nameTrace);
      const nameSnapshot = await getDocs(nameQuery);
      if (!nameSnapshot.empty) return nameSnapshot.docs;
    } catch (error: unknown) {
      this.traceFirestoreRequest(nameTrace, error);
      if (!isMissingIndexError(error)) {
        throw toStaffServiceError(error, "UNKNOWN", { path: COLLECTIONS.customers });
      }
      console.info(
        "[staff-customers] name prefix index is not ready; using a clientId-scoped page fallback"
      );
    }

    const page = await this.browseCustomerDocs(
      firestore,
      clientId,
      Math.max(cap, CUSTOMER_SEARCH_LIMIT)
    );
    return page.filter((customerDoc) => {
      const data = customerDoc.data();
      const haystack = [
        customerDoc.id,
        stringValue(data.uid),
        stringValue(data.name),
        stringValue(data.code),
        stringValue(data.customerCode),
        stringValue(data.phone),
        stringValue(data.normalizedPhone),
        stringValue(data.email),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(nameTerm);
    });
  }

  private static async hydrateCustomers(
    firestore: Firestore,
    clientId: string,
    clientConfig: ClientConfig,
    docs: QueryDocumentSnapshot[]
  ): Promise<CustomerProfile[]> {
    const profiles = await Promise.all(
      docs.map(async (customerDoc) => {
        let loyaltyData: Record<string, unknown> | undefined;
        try {
          const loyaltySnap = await getDoc(
            doc(firestore, COLLECTIONS.loyaltyAccounts, customerDoc.id)
          );
          loyaltyData = loyaltySnap.exists() ? loyaltySnap.data() : undefined;
        } catch (error: unknown) {
          const path = loyaltyAccountPath(customerDoc.id);
          this.traceFirestoreRequest({
            operation: "getDoc",
            path,
            clientId,
            constraints: ["loyalty account must belong to the same customer and staff business"],
            rule: "loyaltyAccounts/{customerId} -> isStaffOf(resource.clientId), or scoped missing-account read",
          }, error);
          throw toStaffServiceError(error, "UNKNOWN", { path });
        }
        return this.toCustomerProfile(customerDoc.id, customerDoc.data(), loyaltyData, clientConfig, clientId);
      })
    );

    return profiles
      .filter((profile): profile is CustomerProfile => profile !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Reconciles lifetime counters from immutable per-business ledgers. These
   * counts are a conservative lower bound and never replace a larger stored
   * lifetime value.
   */
  private static async loadHistoricalLoyaltyCounts(
    firestore: Firestore,
    clientId: string,
    customerId: string
  ): Promise<HistoricalLoyaltyCounts> {
    const [stampCount, redemptionCount] = await Promise.all([
      this.countValidHistoryRows(
        firestore,
        clientId,
        customerId,
        SUBCOLLECTIONS.stampTransactions,
        (id, data) => this.isValidHistoricalStamp(id, data, clientId, customerId)
      ),
      this.countValidHistoryRows(
        firestore,
        clientId,
        customerId,
        SUBCOLLECTIONS.rewardRedemptions,
        (id, data) => this.isValidHistoricalRedemption(id, data, clientId, customerId)
      ),
    ]);
    return { stampCount, redemptionCount };
  }

  private static async countValidHistoryRows(
    firestore: Firestore,
    clientId: string,
    customerId: string,
    subcollection: string,
    isValid: (id: string, data: UnknownRecord) => boolean
  ): Promise<number | undefined> {
    const path = `${COLLECTIONS.clients}/${clientId}/${subcollection}`;
    const trace: FirestoreRequestTrace = {
      operation: "getDocs",
      path,
      clientId,
      constraints: [`customerId == ${customerId}`],
      orderBy: "__name__ asc",
      limit: 500,
      rule: `clients/{clientId}/${subcollection}/{id} -> isStaffOf(clientId)`,
    };
    const source = collection(firestore, COLLECTIONS.clients, clientId, subcollection);
    let cursor: QueryDocumentSnapshot | undefined;
    let count = 0;

    try {
      while (true) {
        const historyQuery = cursor
          ? query(
              source,
              where("customerId", "==", customerId),
              orderBy(documentId()),
              startAfter(cursor),
              limit(500)
            )
          : query(
              source,
              where("customerId", "==", customerId),
              orderBy(documentId()),
              limit(500)
            );
        this.traceFirestoreRequest(trace);
        const snapshot = await getDocs(historyQuery);
        for (const historyDoc of snapshot.docs) {
          if (isValid(historyDoc.id, historyDoc.data())) count += 1;
        }
        if (snapshot.size < 500) break;
        cursor = snapshot.docs[snapshot.docs.length - 1];
      }
      return count;
    } catch (error: unknown) {
      this.traceFirestoreRequest(trace, error);
      // Lifetime repair is best-effort; the transaction preserves stored and
      // current counts if the immutable history is unavailable.
      return undefined;
    }
  }

  private static isValidHistoricalStamp(
    id: string,
    data: UnknownRecord,
    clientId: string,
    customerId: string
  ): boolean {
    if (stringValue(data.clientId) !== clientId || stringValue(data.customerId) !== customerId) {
      return false;
    }
    const type = stringValue(data.type);
    if (type && type !== "STAMP_ADDED") return false;
    if (!type && numberValue(data.delta) !== 1) return false;
    if (data.delta !== undefined && numberValue(data.delta) !== 1) return false;
    if (data.addedCount !== undefined && nonNegativeIntOrUndefined(data.addedCount) !== 1) return false;
    if (data.visitCounted !== undefined && data.visitCounted !== true) return false;
    if (data.transactionId !== undefined && stringValue(data.transactionId) !== id) return false;
    return timestampToMillis(data.createdAt) !== undefined;
  }

  private static isValidHistoricalRedemption(
    id: string,
    data: UnknownRecord,
    clientId: string,
    customerId: string
  ): boolean {
    if (stringValue(data.clientId) !== clientId || stringValue(data.customerId) !== customerId) {
      return false;
    }
    if (data.transactionId !== undefined && stringValue(data.transactionId) !== id) return false;
    const stampCost = nonNegativeIntOrUndefined(data.stampCost);
    if (stampCost === undefined || stampCost < 1) return false;
    return (
      timestampToMillis(data.redeemedAt) !== undefined ||
      timestampToMillis(data.createdAt) !== undefined
    );
  }

  private static async loadCustomerById(
    customerIdOrCode: string,
    clientId: string,
    clientConfig: ClientConfig,
    options: { quiet?: boolean; historicalCounts?: HistoricalLoyaltyCounts } = {}
  ): Promise<CustomerProfile> {
    const cleanId = customerIdOrCode.trim();
    if (!cleanId) throw staffError("CUSTOMER_NOT_FOUND", { detail: "empty customer id" });

    const firestore = this.getRequiredDb();
    const directPath = customerPath(cleanId);
    let customerDocId = cleanId;
    let customerData: UnknownRecord | undefined;

    const directTrace: FirestoreRequestTrace = {
      operation: "getDoc",
      path: directPath,
      clientId,
      constraints: ["single document read; rule checks document.clientId against staffClientId()"],
      rule: "match /customers/{customerId} -> allow get if isStaffOf(resource.data.clientId)",
    };
    this.traceFirestoreRequest(directTrace);
    try {
      const directSnap = await getDoc(doc(firestore, COLLECTIONS.customers, cleanId));
      if (directSnap.exists()) {
        customerData = directSnap.data();
        this.assertClientOwnership(customerData.clientId, clientId, directPath);
      }
    } catch (error: unknown) {
      this.traceFirestoreRequest(directTrace, error);
      if (error instanceof StaffServiceError) throw error;
      if (isPermissionDeniedError(error)) {
        if (options.quiet) {
          throw staffError("CUSTOMER_NOT_FOUND", { path: directPath, detail: "customer read denied" });
        }
        throw staffError("CUSTOMER_NOT_FOUND", {
          path: directPath,
          detail: "customer document is missing or belongs to another business",
        });
      }
      throw toStaffServiceError(error, "UNKNOWN", { path: directPath });
    }

    if (!customerData) {
      const candidates = buildCustomerExactSearchQueries(firestore, clientId, cleanId, 1);

      for (const candidate of candidates) {
        const trace: FirestoreRequestTrace = {
          operation: "getDocs",
          path: COLLECTIONS.customers,
          clientId,
          constraints: [`clientId == ${clientId}`, `${candidate.kind} == [lookup value]`],
          limit: 1,
          rule: "match /customers/{customerId} -> allow list when clientId == staffClientId()",
        };
        this.traceFirestoreRequest(trace);
        const snapshot = await getDocs(candidate.query).catch((error: unknown) => {
          this.traceFirestoreRequest(trace, error);
          throw toStaffServiceError(error, "UNKNOWN", {
            path: COLLECTIONS.customers,
            detail: `customer detail lookup (${candidate.kind})`,
          });
        });
        if (!snapshot.empty) {
          const first = snapshot.docs[0];
          customerDocId = first.id;
          customerData = first.data();
          break;
        }
      }
    }

    if (!customerData) {
      throw staffError("CUSTOMER_NOT_FOUND", { detail: `no customer matched "${cleanId}" in this business` });
    }

    const loyaltyData = await this.readLoyaltyForCustomer(customerDocId, clientId);
    const historicalCounts =
      options.historicalCounts ??
      (await this.loadHistoricalLoyaltyCounts(firestore, clientId, customerDocId));
    const profile = this.toCustomerProfile(
      customerDocId,
      customerData,
      loyaltyData,
      clientConfig,
      clientId,
      historicalCounts
    );
    if (!profile) {
      throw staffError("CUSTOMER_NOT_FOUND", { path: customerPath(customerDocId) });
    }
    return profile;
  }

  private static async readLoyaltyForCustomer(
    customerId: string,
    clientId: string
  ): Promise<UnknownRecord | undefined> {
    const firestore = this.getRequiredDb();
    try {
      const loyaltySnap = await getDoc(doc(firestore, COLLECTIONS.loyaltyAccounts, customerId));
      if (!loyaltySnap.exists()) return undefined;
      const data = loyaltySnap.data();
      const state = resolveLoyaltyState(customerId, clientId, data);
      if (!state.belongsToClient) {
        throw staffError("CROSS_BUSINESS", { path: loyaltyAccountPath(customerId) });
      }
      return data;
    } catch (error: unknown) {
      if (error instanceof StaffServiceError) throw error;
      const path = loyaltyAccountPath(customerId);
      this.traceFirestoreRequest({
        operation: "getDoc",
        path,
        clientId,
        constraints: ["loyalty account must belong to the same customer and staff business"],
        rule: "loyaltyAccounts/{customerId} -> isStaffOf(resource.clientId), or scoped missing-account read",
      }, error);
      throw toStaffServiceError(error, "UNKNOWN", { path });
    }
  }

  private static toCustomerProfile(
    customerDocId: string,
    customerData: UnknownRecord,
    loyaltyData: UnknownRecord | undefined,
    clientConfig: ClientConfig,
    clientId: string,
    historicalCounts: HistoricalLoyaltyCounts = {}
  ): CustomerProfile | null {
    try {
      const docClientId = stringValue(customerData.clientId);
      if (docClientId && docClientId.toLowerCase() !== clientId.toLowerCase()) {
        console.warn(
          `[staff-customers] skipping ${customerPath(customerDocId)} — document clientId does not match the staff clientId`
        );
        return null;
      }

      const name = firstString(customerData.name, customerData.displayName) || "Customer";
      const loyaltyState = resolveLoyaltyState(customerDocId, clientId, loyaltyData);
      const stamps = loyaltyState.belongsToClient ? loyaltyState.stamps : 0;
      const stampTarget = clientConfig.stampTarget;
      const customerCode = firstString(
        customerData.customerCode,
        customerData.code,
        customerData.displayId
      );
      const displayId = firstString(customerData.displayId, customerCode);
      const lastStampAtMillis = timestampToMillis(loyaltyState.lastStampAt);
      const lastVisitAtMillis = timestampToMillis(customerData.lastVisitAt);
      const storedTotalVisits = nonNegativeIntOrUndefined(customerData.totalVisits);
      const totalVisits =
        storedTotalVisits !== undefined || historicalCounts.stampCount !== undefined
          ? Math.max(storedTotalVisits ?? 0, historicalCounts.stampCount ?? 0)
          : undefined;
      const storedLifetimeStamps = loyaltyState.lifetimeStamps;
      const lifetimeStamps =
        storedLifetimeStamps !== undefined ||
        historicalCounts.stampCount !== undefined ||
        stamps > 0
          ? reconcileLifetimeStamps(stamps, storedLifetimeStamps, historicalCounts.stampCount)
          : undefined;
      const storedRewardsRedeemed = loyaltyState.rewardsRedeemed;
      const rewardsRedeemed =
        storedRewardsRedeemed !== undefined || historicalCounts.redemptionCount !== undefined
          ? Math.max(storedRewardsRedeemed ?? 0, historicalCounts.redemptionCount ?? 0)
          : undefined;
      const storedRewardsEarned = loyaltyState.rewardsEarned;
      const rewardsEarned =
        storedRewardsEarned !== undefined || rewardsRedeemed !== undefined
          ? Math.max(storedRewardsEarned ?? 0, rewardsRedeemed ?? 0)
          : undefined;

      // Warm café tints, shared with the design system so a customer avatar
      // looks identical in the lookup list, the detail card and the sheets.
      const avatarBg = avatarTintFor(customerDocId);

      return {
        id: customerDocId,
        customerId: customerDocId,
        uid: firstString(customerData.uid, customerData.authUid, customerData.userId),
        clientId,
        clientSlug: clientConfig.slug,
        customerCode,
        displayId,
        name,
        email: firstString(customerData.email),
        phone: firstString(customerData.phone),
        normalizedPhone: firstString(customerData.normalizedPhone),
        phoneIndexId: firstString(customerData.phoneIndexId),
        tableNumber: firstString(customerData.tableNumber),
        visitingSince: formatTimestamp(customerData.visitingSince ?? customerData.createdAt),
        totalVisits,
        lastVisitAt: formatTimestamp(customerData.lastVisitAt),
        lastVisitAtMillis,
        lastVisitTransactionId: firstString(customerData.lastVisitTransactionId),
        qrToken: firstString(customerData.qrToken),
        status: firstString(customerData.status) || "active",
        avatarInitial: name.charAt(0).toUpperCase() || "C",
        avatarBg,
        stamps,
        stampTarget,
        rewardName: clientConfig.rewardName,
        isEligibleForReward: stamps >= stampTarget,
        lifetimeStamps,
        rewardsEarned,
        rewardsRedeemed,
        lastStampAt: formatTimestamp(loyaltyState.lastStampAt),
        lastStampAtMillis,
        updatedAt: formatTimestamp(customerData.updatedAt),
        createdAt: formatTimestamp(customerData.createdAt),
        // The customer list's relative-time line is specifically the last visit,
        // never an unrelated profile edit or customer registration timestamp.
        lastActivityMillis: lastVisitAtMillis,
      };
    } catch (error: unknown) {
      if (error instanceof StaffServiceError) throw error;
      console.warn(
        `[staff-customers] failed to map ${customerPath(customerDocId)}:`,
        describeErrorForDiagnostics(error)
      );
      return null;
    }
  }

  private static isRewardActivity(data: UnknownRecord): boolean {
    const type = stringValue(data.type);
    return type === "REWARD_REDEEMED" || type === "REWARD";
  }

  private static toActivityItem(
    id: string,
    data: UnknownRecord,
    clientId: string
  ): StaffActivityItem | null {
    const docClientId = stringValue(data.clientId);
    if (docClientId && docClientId.toLowerCase() !== clientId.toLowerCase()) {
      return null;
    }

    const isReward = this.isRewardActivity(data);
    if (!isReward && !isStampLedgerEntry(data)) return null;
    const customerId = firstString(data.customerId);
    const customerCode = firstString(data.customerCode, data.code, data.displayId);
    const staffName = firstString(data.staffName, data.actorName);

    return {
      id,
      clientId,
      staffId: firstString(data.staffId, data.staffUid, data.actorUid),
      staffName,
      customerId,
      customerName: firstString(data.customerName),
      customerCode,
      activityType: isReward ? "REWARD_REDEEMED" : "STAMP_ADDED",
      title: firstString(data.title) || (isReward ? "Reward Redeemed" : "Stamp Added"),
      description:
        firstString(data.description, data.reason) ||
        (isReward
          ? `${firstString(data.rewardName) || "Reward"} redeemed${customerCode ? ` • #${customerCode}` : ""}`
          : `Stamp added${customerCode ? ` • #${customerCode}` : ""}`),
      badgeText: isReward ? "Gift" : "+1",
      badgeType: isReward ? "reward" : "stamp",
      timeFormatted: formatTimestampTime(data.createdAt),
      timestamp: timestampToIso(data.createdAt) || "",
      transactionId: firstString(data.transactionId) || id,
    };
  }

  private static toNotification(
    snapshot: QueryDocumentSnapshot | DocumentSnapshot,
    clientId: string
  ): StaffNotification {
    const data = (snapshot.data() ?? {}) as UnknownRecord;
    const type = (stringValue(data.type) as StaffNotificationType) || "SYSTEM";
    const millis = timestampToMillis(data.createdAt);
    return {
      id: snapshot.id,
      clientId: firstString(data.clientId) || clientId,
      type,
      title: firstString(data.title) || "Notification",
      message: firstString(data.message) || "",
      customerId: firstString(data.customerId),
      read: data.read === true,
      createdAt: formatTimestamp(data.createdAt),
      createdAtMillis: millis,
      metadata: (data.metadata as Record<string, unknown>) || undefined,
    };
  }

  /** Best-effort notification writes — never break the stamp/redeem flow. */
  private static async emitNotifications(
    clientId: string,
    session: StaffSession,
    entries: Array<{
      id: string;
      type: StaffNotificationType;
      title: string;
      message: string;
      customerId?: string;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<void> {
    const firestore = this.getRequiredDb();

    for (const entry of entries) {
      const path = `${notificationsPath(clientId)}/${entry.id}`;
      const trace: FirestoreRequestTrace = {
        operation: "setDoc",
        path,
        sessionUid: session.uid,
        clientId,
        constraints: [
          `type == ${entry.type}`,
          "read == false",
          "staffUid == authenticated UID",
          "createdAt == serverTimestamp()",
        ],
        rule: "clients/{clientId}/notifications/{notificationId} -> schema-valid create if isStaffOf(clientId)",
      };
      this.traceFirestoreRequest(trace);
      try {
        await setDoc(
          doc(firestore, COLLECTIONS.clients, clientId, SUBCOLLECTIONS.notifications, entry.id),
          {
            clientId,
            type: entry.type,
            title: entry.title,
            message: entry.message,
            customerId: entry.customerId ?? null,
            read: false,
            staffUid: session.uid,
            metadata: {
              ...(entry.metadata ?? {}),
              createdBy: "STAFF_APP",
              staffUid: session.uid,
              staffName: session.staffRecord.name,
            },
            createdAt: serverTimestamp(),
          }
        );
      } catch (error: unknown) {
        this.traceFirestoreRequest(trace, error);
        const staffErr = toStaffServiceError(error, "NOTIFICATIONS_UNAVAILABLE", { path });
        console.warn(
          `[staff-notifications] write failed (${staffErr.staffCode}) at ${path}`,
          process.env.NODE_ENV === "production" ? undefined : describeErrorForDiagnostics(staffErr)
        );
        // Notification delivery is best-effort; do not falsely report a stamp
        // or redemption as failed after its ledger transaction committed.
      }
    }
  }

  private static withSession(
    factory: (session: StaffSession) => Unsubscribe,
    onError?: (error: StaffServiceError) => void
  ): Unsubscribe {
    let cancelled = false;
    let unsubscribe: Unsubscribe = NOOP_UNSUBSCRIBE;

    void this.getSession()
      .then((session) => {
        if (cancelled) return;
        const authenticatedUid = this.getRequiredAuth().currentUser?.uid;
        if (!isClientReadySession(session, authenticatedUid)) {
          throw staffError("AUTH_REQUIRED", {
            path: staffUserPath(session.uid),
            detail: "refusing to start a business listener before CLIENT_READY",
          });
        }
        unsubscribe = factory(session);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const staffErr = toStaffServiceError(error);
        if (staffErr.staffCode !== "AUTH_REQUIRED") {
          console.warn("[staff-listener] failed to start:", describeErrorForDiagnostics(staffErr));
        }
        onError?.(staffErr);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }

  private static traceFirestoreRequest(
    request: FirestoreRequestTrace,
    error?: unknown
  ): void {
    // UID, assigned business and request detail are development-only. The
    // production UI and production console do not receive diagnostic identity.
    if (process.env.NODE_ENV === "production") return;
    const authenticatedUid = getFirebaseAuth()?.currentUser?.uid ?? null;
    const details = {
      operation: request.operation,
      path: request.path,
      authenticatedUid,
      sessionUid: request.sessionUid ?? null,
      resolvedStaffClientId: request.clientId ?? null,
      constraints: request.constraints ?? [],
      orderBy: request.orderBy ?? null,
      limit: request.limit ?? null,
      requiredIndex: request.index ?? null,
      expectedRule: request.rule ?? null,
      failure: error === undefined
        ? undefined
        : describeErrorForDiagnostics(
            toStaffServiceError(error, "UNKNOWN", { path: request.path })
          ),
    };
    console.debug("[staff-firestore-request]", details);
  }

  private static mapListenerError(
    error: unknown,
    path: string,
    fallback: Parameters<typeof toStaffServiceError>[1] = "UNKNOWN"
  ): StaffServiceError {
    return toStaffServiceError(error, fallback, { path });
  }

  private static assertClientOwnership(
    value: unknown,
    expectedClientId: string,
    path?: string
  ): void {
    const actual = stringValue(value);
    if (!actual || actual.toLowerCase() !== expectedClientId.toLowerCase()) {
      throw staffError("CROSS_BUSINESS", { path });
    }
  }

  /** Stable client-held operation key for retrying a confirm without duplicating writes. */
  static createIdempotencyKey(operation: "stamp" | "reward"): string {
    return this.createTransactionId(operation);
  }

  private static createTransactionId(prefix: string, requested?: string): string {
    const value =
      requested?.trim() || `tx_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
      throw staffError("UNKNOWN", { detail: "invalid transaction id" }, "Invalid transaction ID.");
    }
    return value;
  }

  private static getRequiredAuth() {
    const auth = getFirebaseAuth();
    if (!auth) throw this.configurationError();
    return auth;
  }

  private static getRequiredDb() {
    const firestore = getFirestoreDb();
    if (!firestore) throw this.configurationError();
    return firestore;
  }

  private static configurationError(): StaffServiceError {
    return staffError("FIREBASE_CONFIG", { detail: firebaseConfigError ?? "firebase app unavailable" });
  }

  private static isConfigurationError(error: StaffServiceError): boolean {
    return error.staffCode === "FIREBASE_CONFIG";
  }

  /** Exposed for diagnostics screens/tests. */
  static getConfigurationError(): StaffServiceError {
    return this.configurationError();
  }

}
