import {
  collection,
  documentId,
  limit,
  orderBy,
  query,
  where,
  type Firestore,
  type Query,
  type QueryConstraint,
} from "firebase/firestore";
import { assertSafeSegment, COLLECTIONS, SUBCOLLECTIONS } from "./firestorePaths.ts";

/**
 * Firestore query builders used by the staff data service.
 *
 * Keeping the tenant predicate in one builder makes it difficult for a future
 * customer lookup/count query to accidentally enumerate the global collection.
 * Callers must pass the clientId resolved from staffUsers/{authenticated UID}.
 */
function customersForClient(
  firestore: Firestore,
  clientId: string,
  ...constraints: QueryConstraint[]
): Query {
  const safeClientId = assertSafeSegment(clientId, "clientId");
  return query(
    collection(firestore, COLLECTIONS.customers),
    where("clientId", "==", safeClientId),
    ...constraints
  );
}

export function buildCustomerDirectoryQuery(
  firestore: Firestore,
  clientId: string,
  resultLimit: number
): Query {
  return customersForClient(firestore, clientId, limit(resultLimit));
}

export interface CustomerExactSearchQuery {
  /** Non-sensitive label for development diagnostics. */
  kind: "documentId" | "uid" | "code" | "customerCode" | "normalizedPhone" | "phone" | "phoneIndexId";
  query: Query;
}

/**
 * Exact customer lookup candidates. Every candidate is constrained by
 * clientId before its exact-match predicate is added.
 */
export function buildCustomerExactSearchQueries(
  firestore: Firestore,
  clientId: string,
  term: string,
  resultLimit: number
): CustomerExactSearchQuery[] {
  const raw = term.trim();
  if (!raw) return [];

  const code = raw.replace(/^#/, "").trim().toUpperCase();
  const digits = raw.replace(/\D/g, "");
  const lastTen = digits.length >= 10 ? digits.slice(-10) : null;
  const phone = lastTen ? `+91${lastTen}` : null;
  const phoneIndexId = lastTen ? `${clientId}_${lastTen}` : null;
  const cap = Math.min(Math.max(resultLimit, 1), 100);
  const candidates: CustomerExactSearchQuery[] = [
    {
      kind: "documentId",
      query: customersForClient(
        firestore,
        clientId,
        where(documentId(), "==", raw),
        limit(cap)
      ),
    },
    {
      kind: "uid",
      query: customersForClient(firestore, clientId, where("uid", "==", raw), limit(cap)),
    },
    {
      kind: "code",
      query: customersForClient(firestore, clientId, where("code", "==", code), limit(cap)),
    },
    {
      kind: "customerCode",
      query: customersForClient(
        firestore,
        clientId,
        where("customerCode", "==", code),
        limit(cap)
      ),
    },
  ];

  if (phone) {
    candidates.push(
      {
        kind: "normalizedPhone",
        query: customersForClient(
          firestore,
          clientId,
          where("normalizedPhone", "==", phone),
          limit(cap)
        ),
      },
      {
        kind: "phone",
        query: customersForClient(firestore, clientId, where("phone", "==", phone), limit(cap)),
      },
      {
        kind: "phoneIndexId",
        query: customersForClient(
          firestore,
          clientId,
          where("phoneIndexId", "==", phoneIndexId),
          limit(cap)
        ),
      }
    );
  }

  return candidates;
}

/** Name prefix search is still business-scoped and uses the declared index. */
export function buildCustomerNamePrefixQuery(
  firestore: Firestore,
  clientId: string,
  searchTerm: string,
  resultLimit: number
): Query {
  const normalized = searchTerm.trim().toLowerCase();
  const cap = Math.min(Math.max(resultLimit, 1), 100);
  return customersForClient(
    firestore,
    clientId,
    where("name", ">=", normalized),
    where("name", "<=", `${normalized}\uf8ff`),
    orderBy("name", "asc"),
    limit(cap)
  );
}

/**
 * Counts customers registered in the local-day interval for the assigned
 * business. The explicit ascending order matches the composite index
 * (clientId ASC, createdAt ASC).
 */
export function buildTodayCustomersCountQuery(
  firestore: Firestore,
  clientId: string,
  startOfToday: Date
): Query {
  const endOfTodayExclusive = new Date(startOfToday);
  endOfTodayExclusive.setDate(endOfTodayExclusive.getDate() + 1);

  return customersForClient(
    firestore,
    clientId,
    where("createdAt", ">=", startOfToday),
    where("createdAt", "<", endOfTodayExclusive),
    orderBy("createdAt", "asc")
  );
}

/** Canonical live staff notification query; the client path is its tenant scope. */
export function buildNotificationsListenerQuery(
  firestore: Firestore,
  clientId: string,
  resultLimit = 20
): Query {
  const safeClientId = assertSafeSegment(clientId, "clientId");
  return query(
    collection(firestore, COLLECTIONS.clients, safeClientId, SUBCOLLECTIONS.notifications),
    orderBy("createdAt", "desc"),
    limit(resultLimit)
  );
}
