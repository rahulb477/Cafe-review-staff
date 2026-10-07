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
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  DocumentReference,
  DocumentSnapshot,
} from "firebase/firestore";
import { firebaseConfigError, getFirebaseAuth, getFirestoreDb } from "@/lib/firebase";
import { avatarTintFor } from "@/lib/format";
import type { Firestore } from "firebase/firestore";
import {
  buildClientConfig,
  buildStaffUser,
  firstString,
  isStampLedgerEntry,
  nonNegativeInt,
  numberValue,
  isRewardRedeemable,
  nextStampBalance,
  remainingStampsAfterRedemption,
  resolveLoyaltyState,
  resolveStampTarget,
  stampVisitAlreadyApplied,
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
   * Adds one stamp using an uncounted ledger reservation followed by an atomic
   * visit-and-loyalty transaction. The stamp transaction document is the
   * idempotency record: replaying the same transaction id returns the original
   * result and can never increment totalVisits twice.
   */
  static async addStamp(
    customerId: string,
    idempotencyTxId?: string,
    notes?: string
  ): Promise<StampTransactionResult> {
    const session = await this.requireSession();
    const clientId = session.clientId;
    const clientConfig = session.clientRecord;

    if (!clientConfig.loyaltyEnabled) {
      throw staffError("LOYALTY_DISABLED", { path: `${COLLECTIONS.clients}/${clientId}.loyalty` });
    }

    const cleanCustomerId = assertSafeSegment(customerId, "customerId");
    const transactionId = this.createTransactionId("stamp", idempotencyTxId);
    const firestore = this.getRequiredDb();

    const transactionRef = doc(
      firestore,
      COLLECTIONS.clients,
      clientId,
      SUBCOLLECTIONS.stampTransactions,
      transactionId
    );
    const customerRef = doc(firestore, COLLECTIONS.customers, cleanCustomerId);
    const loyaltyRef = doc(firestore, COLLECTIONS.loyaltyAccounts, cleanCustomerId);

    /* ------------------------------------------------------------------ *
     * PHASE 1 — create the idempotency ledger row as UNCOUNTED.
     *
     * Phase 2 must update this existing row from false to true in the same
     * atomic commit as the customer visit and loyalty changes. Keeping the row
     * uncounted until then means a failed phase 2 never records a visit; a
     * same-key retry can safely resume the operation.
     * ------------------------------------------------------------------ */
    const phaseOnePath = `${stampTransactionsPath(clientId)}/${transactionId}`;
    const phaseOneTrace: FirestoreRequestTrace = {
      operation: "runTransaction",
      path: phaseOnePath,
      sessionUid: session.uid,
      clientId,
      constraints: [
        `read customers/${cleanCustomerId}`,
        `read loyaltyAccounts/${cleanCustomerId}`,
        "create uncounted stamp transaction",
      ],
      rule: "clients/{clientId}/stampTransactions/{transactionId} -> create requires isStaffOf(clientId), staffId == uid(), and same-business customer",
    };
    this.traceFirestoreRequest(phaseOneTrace);
    try {
      await runTransaction(firestore, async (transaction) => {
        const customerSnap = await transaction.get(customerRef);
        const existingTxSnap = await transaction.get(transactionRef);
        const loyaltySnap = await transaction.get(loyaltyRef);

        if (!customerSnap.exists()) {
          throw staffError("CUSTOMER_NOT_FOUND", { path: customerPath(cleanCustomerId) });
        }
        const customerData = customerSnap.data();
        this.assertClientOwnership(customerData.clientId, clientId, customerPath(cleanCustomerId));

        const loyaltyData = loyaltySnap.exists() ? loyaltySnap.data() : undefined;
        if (loyaltyData) {
          this.assertClientOwnership(loyaltyData.clientId, clientId, loyaltyAccountPath(cleanCustomerId));
          if (!resolveLoyaltyState(cleanCustomerId, clientId, loyaltyData).belongsToClient) {
            throw staffError("CROSS_BUSINESS", { path: loyaltyAccountPath(cleanCustomerId) });
          }
        }

        if (existingTxSnap.exists()) {
          // Idempotency key already used: never append the same operation twice.
          // PHASE 2 completes (or replays) it.
          const existing = existingTxSnap.data();
          const existingPath = `${stampTransactionsPath(clientId)}/${transactionId}`;
          this.assertClientOwnership(existing.clientId, clientId, existingPath);
          if (
            String(existing.customerId) !== cleanCustomerId ||
            stringValue(existing.type) !== "STAMP_ADDED" ||
            stringValue(existing.staffId) !== session.uid ||
            stringValue(existing.staffUid) !== session.uid
          ) {
            throw staffError("DUPLICATE_OPERATION", {
              path: existingPath,
              detail: "transaction id is not an unambiguous stamp by the authenticated staff uid for this customer",
            });
          }
          return;
        }

        const previousStamps = loyaltyData
          ? resolveLoyaltyState(cleanCustomerId, clientId, loyaltyData).stamps
          : 0;
        const stampTarget = resolveStampTarget(loyaltyData?.stampTarget, clientConfig.stampTarget);
        const rewardName = firstString(loyaltyData?.rewardName, clientConfig.rewardName) as string;
        const newStamps = nextStampBalance(previousStamps);
        const customerName = firstString(customerData.name) || "Customer";
        const customerCode =
          firstString(customerData.code, customerData.customerCode) || cleanCustomerId.substring(0, 6);

        transaction.set(transactionRef, {
          clientId,
          customerId: cleanCustomerId,
          transactionId,
          staffId: session.uid,
          staffUid: session.uid,
          staffName: session.staffRecord.name,
          actorType: "STAFF",
          actorName: session.staffRecord.name,
          type: "STAMP_ADDED",
          title: "Stamp Added",
          description: `${customerName} #${customerCode}`,
          reason: notes?.trim() || "Visit stamp (counter)",
          delta: 1,
          addedCount: 1,
          customerName,
          customerCode,
          // PHASE 2 marks this counted inside the atomic customer update — the
          // canonical rules require the reference to already exist and to become
          // counted by the same commit.
          visitCounted: false,
          stampCountBefore: previousStamps,
          stampCountAfter: newStamps,
          stampTarget,
          rewardName,
          rewardUnlocked: newStamps >= stampTarget,
          notes: notes?.trim() || "Standard loyalty stamp",
          createdAt: serverTimestamp(),
        });
      });
    } catch (error: unknown) {
      this.traceFirestoreRequest(phaseOneTrace, error);
      throw toStaffServiceError(error, "UNKNOWN", {
        path: phaseOnePath,
        detail: "append uncounted stamp transaction",
      });
    }

    /* ------------------------------------------------------------------ *
     * PHASE 2 — count the visit and move the loyalty balance atomically.
     *
     * The canonical path marks the ledger row counted in the same commit
     * (`getAfter(...).visitCounted == true`). If that rule is not deployed,
     * fail visibly and keep the uncounted phase-one row for a same-key retry;
     * never bypass the security invariant with an alternate write.
     * ------------------------------------------------------------------ */
    const visitArgs = {
      firestore,
      clientId,
      clientConfig,
      session,
      customerId: cleanCustomerId,
      transactionId,
      transactionRef,
      customerRef,
      loyaltyRef,
    };

    let outcome: StampTransactionOutcome;
    try {
      outcome = await this.applyStampVisit(visitArgs);
    } catch (error: unknown) {
      const path = `${stampTransactionsPath(clientId)}/${transactionId}`;
      this.traceFirestoreRequest({
        operation: "runTransaction",
        path,
        sessionUid: session.uid,
        clientId,
        constraints: [
          "mark existing visitCounted=false transaction true",
          "customer.totalVisits += 1",
          "customer.lastVisitAt = request time",
          "customer.lastVisitTransactionId = transactionId",
          "loyaltyAccount.stamps += 1",
        ],
        rule: "customer visit update requires get(tx).visitCounted != true and getAfter(tx).visitCounted == true",
      }, error);
      throw toStaffServiceError(error, "UNKNOWN", { path, detail: "apply counted stamp visit" });
    }

    const updatedCustomer = await this.loadCustomerById(
      cleanCustomerId,
      clientId,
      clientConfig,
      { quiet: true }
    );

    if (!outcome.replayed) {
      await this.emitNotifications(clientId, session, [
        {
          id: `${transactionId}_stamp`,
          type: "STAMP_ADDED",
          title: "Stamp added",
          message: `${outcome.customerName} received 1 stamp (${outcome.newStamps}/${outcome.stampTarget}).`,
          customerId: cleanCustomerId,
          metadata: {
            transactionId,
            stamps: outcome.newStamps,
            stampTarget: outcome.stampTarget,
            staffUid: session.uid,
            staffName: session.staffRecord.name,
          },
        },
      ]);
    }

    if (!outcome.replayed && outcome.rewardUnlocked) {
      await this.emitNotifications(clientId, session, [
        {
          id: `${transactionId}_reward_ready`,
          type: "REWARD_READY",
          title: "Reward ready",
          message: `${outcome.customerName} is ready for ${outcome.rewardName}.`,
          customerId: cleanCustomerId,
          metadata: {
            transactionId,
            stamps: outcome.newStamps,
            stampTarget: outcome.stampTarget,
            rewardName: outcome.rewardName,
            staffUid: session.uid,
          },
        },
      ]);
    }

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
   * PHASE 2 of a stamp: counts the visit, marks the ledger row counted and
   * updates the loyalty balance in ONE transaction.
   *
   * Every write matches what the Security Rules whitelist:
   *   - `stampTransactions`: only `visitCounted` / `visitCountedAt`, once;
   *   - `customers`: only `totalVisits` (+1, mirroring the rules' baseline),
   *     `lastVisitAt`, `updatedAt`, `lastVisitTransactionId`;
   *   - `loyaltyAccounts`: `clientId`/`customerId` unchanged, `stamps` int >= 0.
   */
  private static async applyStampVisit(
    args: {
      firestore: Firestore;
      clientId: string;
      clientConfig: ClientConfig;
      session: StaffSession;
      customerId: string;
      transactionId: string;
      transactionRef: DocumentReference;
      customerRef: DocumentReference;
      loyaltyRef: DocumentReference;
    }
  ): Promise<StampTransactionOutcome> {
    const { firestore, clientId, clientConfig, customerId, transactionId } = args;
    const ledgerPath = `${stampTransactionsPath(clientId)}/${transactionId}`;

    return runTransaction(firestore, async (transaction) => {
      const transactionSnap = await transaction.get(args.transactionRef);
      if (!transactionSnap.exists()) {
        throw staffError("DUPLICATE_OPERATION", {
          path: ledgerPath,
          detail: "stamp transaction disappeared before the visit was counted",
        });
      }
      const ledgerData = transactionSnap.data();
      this.assertClientOwnership(ledgerData.clientId, clientId, ledgerPath);
      if (
        String(ledgerData.customerId) !== customerId ||
        stringValue(ledgerData.type) !== "STAMP_ADDED" ||
        stringValue(ledgerData.staffId) !== args.session.uid ||
        stringValue(ledgerData.staffUid) !== args.session.uid
      ) {
        throw staffError("DUPLICATE_OPERATION", {
          path: ledgerPath,
          detail: "stamp transaction does not match this customer and authenticated staff uid",
        });
      }

      const customerSnap = await transaction.get(args.customerRef);
      if (!customerSnap.exists()) {
        throw staffError("CUSTOMER_NOT_FOUND", { path: customerPath(customerId) });
      }
      const customerData = customerSnap.data();
      this.assertClientOwnership(customerData.clientId, clientId, customerPath(customerId));

      const loyaltySnap = await transaction.get(args.loyaltyRef);
      const loyaltyData = loyaltySnap.exists() ? loyaltySnap.data() : undefined;
      if (loyaltyData) {
        this.assertClientOwnership(loyaltyData.clientId, clientId, loyaltyAccountPath(customerId));
      }

      const stampTarget = resolveStampTarget(
        ledgerData.stampTarget,
        loyaltyData?.stampTarget,
        clientConfig.stampTarget
      );
      const rewardName = firstString(
        loyaltyData?.rewardName,
        ledgerData.rewardName,
        clientConfig.rewardName
      ) as string;
      const customerName = firstString(customerData.name, ledgerData.customerName) || "Customer";

      // Keep the customer marker as a defensive replay check in addition to
      // the transaction's visitCounted flag. A successful commit updates both.
      const alreadyApplied = stampVisitAlreadyApplied(
        ledgerData,
        customerData,
        transactionId
      );

      if (alreadyApplied) {
        // Already applied by an earlier attempt — replay, never re-count.
        const appliedStamps = nonNegativeInt(ledgerData.stampCountAfter);
        return {
          previousStamps: nonNegativeInt(ledgerData.stampCountBefore),
          newStamps: appliedStamps,
          stampTarget,
          rewardUnlocked: ledgerData.rewardUnlocked === true || appliedStamps >= stampTarget,
          rewardName,
          customerId,
          customerName,
          replayed: true,
        } satisfies StampTransactionOutcome;
      }

      // The balance is always computed from the value read NOW, so two staff
      // members stamping at the same moment never lose a stamp.
      const previousStamps = loyaltyData
        ? resolveLoyaltyState(customerId, clientId, loyaltyData).stamps
        : 0;
      const newStamps = nextStampBalance(previousStamps);
      const rewardUnlocked = newStamps >= stampTarget;

      transaction.set(
        args.transactionRef,
        {
          visitCounted: true,
          visitCountedAt: serverTimestamp(),
          stampCountBefore: previousStamps,
          stampCountAfter: newStamps,
          stampTarget,
          rewardName,
          rewardUnlocked,
        },
        { merge: true }
      );

      transaction.update(args.customerRef, {
        totalVisits: visitBaseline(customerData.totalVisits) + 1,
        lastVisitAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastVisitTransactionId: transactionId,
      });

      transaction.set(
        args.loyaltyRef,
        {
          clientId,
          customerId,
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
        customerId,
        customerName,
        replayed: false,
      } satisfies StampTransactionOutcome;
    });
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
        const customerName = firstString(customerData.name) || "Customer";
        const customerCode =
          firstString(customerData.code, customerData.customerCode) || cleanCustomerId.substring(0, 6);

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

        const stampTarget = resolveStampTarget(loyaltyData.stampTarget, clientConfig.stampTarget);
        const rewardName = firstString(loyaltyData.rewardName, clientConfig.rewardName) as string;
        const currentStamps = loyaltyState.stamps;

        if (!isRewardRedeemable(currentStamps, stampTarget)) {
          throw staffError("NOT_ELIGIBLE", {
            detail: `customer has ${currentStamps}/${stampTarget} stamps`,
          });
        }

        const remainingStamps = remainingStampsAfterRedemption(currentStamps, stampTarget);
        const previousRewards = nonNegativeInt(loyaltyData.totalRewardsRedeemed);

        transaction.set(redemptionRef, {
          clientId,
          customerId: cleanCustomerId,
          customerName,
          customerCode,
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
          description: `${rewardName} • ${customerName} #${customerCode}`,
          reason: `${rewardName} redeemed`,
          delta: -stampTarget,
          customerName,
          customerCode,
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
            stamps: remainingStamps,
            isEligibleForReward: remainingStamps >= stampTarget,
            totalRewardsRedeemed: previousRewards + 1,
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
      { quiet: true }
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

  private static async loadCustomerById(
    customerIdOrCode: string,
    clientId: string,
    clientConfig: ClientConfig,
    options: { quiet?: boolean } = {}
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
    const profile = this.toCustomerProfile(
      customerDocId,
      customerData,
      loyaltyData,
      clientConfig,
      clientId
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
    clientId: string
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
      const stampTarget = resolveStampTarget(
        loyaltyState.stampTarget,
        clientConfig.stampTarget
      );
      const customerCode =
        firstString(customerData.code, customerData.customerCode) ||
        customerDocId.substring(0, 6).toUpperCase();

      // Warm café tints, shared with the design system so a customer avatar
      // looks identical in the lookup list, the detail card and the sheets.
      const avatarBg = avatarTintFor(customerDocId);

      // Newest real timestamp on the record, used only for relative
      // "2 mins ago" copy in the lookup list. Missing data stays missing.
      const lastStampAtMillis = this.timestampToMillis(loyaltyState.lastStampAt);
      const lastVisitAtMillis = this.timestampToMillis(customerData.lastVisitAt);
      const updatedAtMillis = this.timestampToMillis(customerData.updatedAt);
      const createdAtMillis = this.timestampToMillis(customerData.createdAt);
      const lastActivityMillis = [
        lastStampAtMillis,
        lastVisitAtMillis,
        updatedAtMillis,
        createdAtMillis,
      ].reduce<number | undefined>(
        (newest, candidate) =>
          candidate === undefined ? newest : newest === undefined ? candidate : Math.max(newest, candidate),
        undefined
      );

      return {
        id: customerDocId,
        uid: firstString(customerData.uid) || customerDocId,
        clientId,
        clientSlug: clientConfig.slug,
        customerCode,
        name,
        email: firstString(customerData.email),
        phone: firstString(customerData.phone),
        normalizedPhone: firstString(customerData.normalizedPhone),
        phoneIndexId: firstString(customerData.phoneIndexId),
        tableNumber: firstString(customerData.tableNumber),
        visitingSince: this.formatFirestoreTimestamp(
          customerData.visitingSince ?? customerData.createdAt
        ),
        totalVisits: nonNegativeInt(customerData.totalVisits),
        lastVisitAt: this.formatFirestoreTimestamp(customerData.lastVisitAt),
        lastVisitTransactionId: firstString(customerData.lastVisitTransactionId),
        qrToken: firstString(customerData.qrToken) || customerDocId,
        status: firstString(customerData.status) || "active",
        avatarInitial: name.charAt(0).toUpperCase() || "C",
        avatarBg,
        stamps,
        stampTarget,
        rewardName: firstString(loyaltyState.rewardName, clientConfig.rewardName) as string,
        isEligibleForReward: stamps >= stampTarget,
        lastStampAt: this.formatFirestoreTimestamp(loyaltyState.lastStampAt),
        updatedAt: this.formatFirestoreTimestamp(customerData.updatedAt),
        createdAt: this.formatFirestoreTimestamp(customerData.createdAt),
        lastActivityMillis,
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
    if (type === "REWARD_REDEEMED") return true;
    if (type === "STAMP_ADDED") return false;
    const delta = numberValue(data.delta);
    if (delta !== undefined) return delta < 0;
    return false;
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

    if (data.type === "STAMP_ADDED" && data.visitCounted === false) return null;

    const isReward = this.isRewardActivity(data);
    const customerId = firstString(data.customerId);
    const customerCode =
      firstString(data.customerCode, data.customerId)?.substring(0, 6).toUpperCase() ?? "";
    const staffName = firstString(data.staffName, data.actorName, data.actorUid);

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
      timeFormatted: this.formatTimeOnly(data.createdAt),
      timestamp: this.isoTimestamp(data.createdAt) || new Date().toISOString(),
      transactionId: firstString(data.transactionId) || id,
    };
  }

  private static toNotification(
    snapshot: QueryDocumentSnapshot | DocumentSnapshot,
    clientId: string
  ): StaffNotification {
    const data = (snapshot.data() ?? {}) as UnknownRecord;
    const type = (stringValue(data.type) as StaffNotificationType) || "SYSTEM";
    const millis = this.timestampToMillis(data.createdAt);
    return {
      id: snapshot.id,
      clientId: firstString(data.clientId) || clientId,
      type,
      title: firstString(data.title) || "Notification",
      message: firstString(data.message) || "",
      customerId: firstString(data.customerId),
      read: data.read === true,
      createdAt: this.formatFirestoreTimestamp(data.createdAt),
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

  /* ------------------------------------------------------------------ *
   * Timestamp helpers (the platform mixes Firestore Timestamps and epoch ms)
   * ------------------------------------------------------------------ */

  static timestampToMillis(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (value instanceof Date) return value.getTime();
    const candidate = value as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
    if (typeof candidate.toMillis === "function") {
      const millis = candidate.toMillis();
      return Number.isFinite(millis) ? millis : undefined;
    }
    if (typeof candidate.toDate === "function") return candidate.toDate().getTime();
    if (typeof candidate.seconds === "number") return candidate.seconds * 1000;
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  static formatFirestoreTimestamp(value: unknown): string | undefined {
    const millis = this.timestampToMillis(value);
    if (millis === undefined) return undefined;
    try {
      return new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(millis));
    } catch {
      return undefined;
    }
  }

  private static isoTimestamp(value: unknown): string | undefined {
    const millis = this.timestampToMillis(value);
    return millis === undefined ? undefined : new Date(millis).toISOString();
  }

  private static formatTimeOnly(value: unknown): string {
    const millis = this.timestampToMillis(value);
    if (millis === undefined) return "Just now";
    try {
      return new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(millis));
    } catch {
      return "Just now";
    }
  }

  /** Exposed for diagnostics screens/tests. */
  static getConfigurationError(): StaffServiceError {
    return this.configurationError();
  }

}
