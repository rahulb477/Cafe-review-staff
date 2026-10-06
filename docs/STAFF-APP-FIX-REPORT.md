# Staff App — Functionality Fix Report (A–Z)

> **Note (superseded in part).** This report covers the *functionality* pass and states that the
> UI was deliberately left untouched. The UI has since been redesigned — see
> [`STAFF-APP-UI-REDESIGN.md`](./STAFF-APP-UI-REDESIGN.md). Everything below about Firebase,
> authorization, paths, the scanner lifecycle, the two-phase visit write, notifications and the
> ruleset is still current; only sections **R** and **V**'s "UI preserved" claim and the two
> matching readiness checks have been replaced by design-system checks.

Repository: `rahulb477/Cafe-review-staff` · branch `arena/99bf539f-cafe-review-staff`
Firebase project: **`cafe-review7`** (unchanged — no new project, database or auth system)
Scope: functional fixes only. **No UI redesign** — colours, typography, spacing, cards, buttons,
navigation, scanner visuals and the login screen are byte-for-byte unchanged (enforced by the
readiness script, see **R**/**V**).

---

## A. Root cause of the login error

`Your assigned business configuration is incomplete in Firebase.` was **not** a Firebase problem.
It was thrown by the Staff App itself from `loadClientConfig()` / `buildClientConfig()`.

The platform (Admin app `ClientService`) stores loyalty settings **embedded** in the business
document, with these exact paths:

```
clients/{clientId}.loyalty.enabled
clients/{clientId}.loyalty.stampTarget
clients/{clientId}.loyalty.rewardName
clients/{clientId}.loyalty.rewardDescription
clients/{clientId}.loyalty.rewardImage
```

The old Staff App read top-level fields that do not exist in that schema
(`data.stampTarget`, `data.rewardName`), so the validation called those values missing and threw the
generic "configuration is incomplete" error — after a **successful** sign-in, on **every** login.

## B. Why that exact message appeared

1. `signInWithEmailAndPassword` succeeded → Firebase Auth UID existed.
2. `staffUsers/{uid}` resolved → the staff account was valid and active.
3. `clients/{clientId}` was **read successfully** (Firestore rules allow a staff member to read
   their assigned business).
4. The mapper then looked for `stampTarget`/`rewardName` at the document root, found `undefined`,
   and the old code threw the configuration error instead of accepting the document.

So the message was a **schema mismatch inside the app**, not a missing configuration, not a rules
problem, and not an Auth problem. The red box was correctly reporting a real code defect — the fix
therefore had to be in the mapper, never in the message.

## C. The exact Firebase paths involved

| Step | Path | Purpose |
| --- | --- | --- |
| 1 | `staffUsers/{uid}` | Authorization source of truth (status + `clientId`) |
| 2 | `clients/{clientId}` | Business document; `loyalty.*` holds the loyalty programme |
| 3 | `clients/{clientId}/stampTransactions/{transactionId}` | Append-only stamp / redemption ledger |
| 4 | `customers/{customerId}` | Store-scoped customer profile + visit counters |
| 5 | `customerTokens/{token}` | QR resolution (`{customerId, clientId, createdAt}`) |
| 6 | `loyaltyAccounts/{customerId}` | Stamp balance |
| 7 | `clients/{clientId}/rewardRedemptions/{redemptionId}` | Append-only redemption ledger |
| 8 | `clients/{clientId}/notifications/{notificationId}` | Real staff notifications |
| 9 | `clients/{clientId}/reviews/{reviewId}` | Dashboard review metric (read-only for staff) |

## D. `staffUsers/{uid}` → `clientId` → `clients/{clientId}` resolution

`FirebaseService.resolveSession()` is the single resolver used by the auth listener, the login call
and every data operation:

```
Firebase Auth user
  → get staffUsers/{uid}            (missing            → "Staff account not found.")
  → validate status / active        (inactive           → "Your staff account is inactive.")
  → read clientId                   (absent             → "Your staff account is not assigned to a business.")
  → get clients/{clientId}          (missing            → "Assigned business could not be found.")
  → build ClientConfig (loyalty.* first, flat legacy fields as fallback)
  → session { firebaseUser, uid, staffRecord, clientId, clientRecord }
```

* `clientId` is **only** ever taken from `staffUsers/{uid}` (a single-entry legacy `clientIds[]` is
  accepted when `clientId` is absent).
* It is never read from the URL, query string, `localStorage`, a dropdown, or a QR payload.
* `validateStaffRecord()` treats `active: false` and the statuses
  inactive/disabled/suspended/blocked/deactivated/removed as inactive; a missing status is treated as
  active (the same default the Security Rules use).
* On any authorization failure the user is signed out, the session cache is cleared and the precise
  error is rendered — never a generic one.

## E. The exact permission error (and its real cause)

Symptom reported: Firestore `Missing or insufficient permissions.` while stamping / scanning.

Root cause: the stamp was written as **one commit that created the ledger row already counted**
(`visitCounted: true`) *and* updated `customers/{customerId}`. The canonical platform ruleset counts
a visit by pairing an **existing, still-uncounted** transaction with the customer update:

```
// customers/{customerId} — staff visit counting (canonical ruleset)
get(visitTx).data.get('visitCounted', false) != true      // existed and was uncounted
getAfter(visitTx).data.get('visitCounted', false) == true // becomes counted in this commit
```

`get()` cannot see sibling writes, so the `customers` update was denied and the whole transaction
aborted with `permission-denied`.

Fix (`addStamp`, `applyStampVisit`):

* **PHASE 1** — create `clients/{clientId}/stampTransactions/{transactionId}` with
  `visitCounted: false` (plus the canonical `clientId`, `customerId`, `staffId`, `staffUid`,
  `createdAt: serverTimestamp()`). This is exactly the platform's authoritative
  `staffVisitService` order.
* **PHASE 2** — one transaction that (a) marks the row counted
  (`{visitCounted: true, visitCountedAt: serverTimestamp()}` — the only mutable fields),
  (b) updates `customers/{customerId}` with exactly the four whitelisted fields and
  `totalVisits = oldVisits() + 1`, and (c) merges the loyalty balance.
* **Idempotency** — a transaction whose `visitCounted === true`, or whose id already equals the
  customer's `lastVisitTransactionId`, is *replayed*: it can never increment `totalVisits` twice
  (double tap, network retry, React StrictMode).
* **Append-only rulesets** — if the deployed ruleset forbids the counted update (an append-only
  ledger variant), the denial is **logged loudly** and the visit is still counted on a fallback
  write; nothing is hidden and the counter stays correct. (See **T**.)
* `readLoyaltyForCustomer()` treats a denied loyalty read as "no stamps" **and warns**, so a rules
  gap can never fake a balance.
* No rule was weakened: no `allow read, write: if true`, no global staff access.

Second, independent permission cause (scanner): `customerTokens/{token}` and
`clients/{clientId}/notifications` **do not exist in the admin ruleset** that is deployed to
`cafe-review7`; staff reads therefore return `permission-denied`. The ruleset in this repository now
contains both blocks (see **M**/**T**).

## F. Code fix (what changed and why)

* `src/services/clientConfig.ts` — canonical mappers. `buildClientConfig` reads
  `loyalty.{stampTarget,rewardName,rewardDescription,enabled}` first (flat
  `stampTarget`/`rewardName`/`stampsRequired` accepted as legacy fallback), clamps the target to
  1–30 like the Admin app, and **never throws for an existing document**. Also added
  `visitBaseline()` (mirrors the rules' `oldVisits()`) and `isStampLedgerEntry()`.
* `src/services/staffErrors.ts` — the complete error taxonomy with the exact required copy (see
  **X**); `describeErrorForDiagnostics()` keeps Firebase code + path + raw message for dev
  diagnostics, while the user-facing message stays precise.
* `src/services/firestorePaths.ts` — canonical path builders only; asserts safe document ids.
* `src/services/qrPayload.ts` — extracts `ct` from the Customer App's QR URL
  (`https://<customer-app>/<slug>?ct=<64-hex>`), supports legacy raw/JSON shapes, validates the
  64-hex format. The URL slug is a *diagnostic hint only*, never authorization.
* `src/services/firebaseService.ts` — the data layer: session resolution, scoped customer lookup,
  the two-phase stamp/visit, atomic redemption, notifications, dashboard and activity listeners.
* `src/context/StaffAppContext.tsx` — one canonical session context (state machine
  `initializing → signed-out | authorizing → authorized | error`), consumed by every page; no page
  derives its own `clientId`. Route canonicalization replaces any slug that is not the assigned
  business.
* `src/components/StaffShell.tsx` — loading gate (never an error while Auth resolves), authorization
  error card with technical detail in development only, and it never renders the dashboard without a
  resolved `clientId`.
* `src/components/StaffHeader.tsx` — live notifications from Firebase, unread badge from Firestore,
  mark-as-read with optimistic + failure-tolerant update.
* Pages (`dashboard`, `customers`, `customers/[customerId]`, `rewards`, `activity`, `settings`,
  `scan`, `login`) — all consume the canonical context and the scoped service API, with explicit
  error banners + retry, and no tenant selector anywhere.
* `src/lib/firebaseConfig.ts` / `src/lib/firebase.ts` — one Firebase initialisation from the six
  `NEXT_PUBLIC_FIREBASE_*` variables, placeholder/project-id validation, and the exact
  `Staff Firebase configuration could not be loaded.` message on genuine configuration failure.
  No dummy credentials, no silent fallback.
* `src/app/api/health/route.ts` — diagnostics endpoint: expected vs actual projectId, missing or
  placeholder keys, canonical path list.
* `firestore.rules` — the deployable **project** ruleset (see **T**).
* `firestore.indexes.json`, `firebase.json`, `.firebaserc` — deploy wiring for project `cafe-review7`.

## G. Scanner root cause (lag / hang / dead buttons)

* Old loop decoded a **full-resolution 1280×720 frame on every animation frame** with jsQR, and
  issued a Firestore read per detected frame. jsQR is O(pixels) on the main thread, so the UI froze
  (dead-looking buttons) and the camera appeared to hang.
* Fix: decode at most every **180 ms**, on a canvas downscaled to **480 px wide**
  (`willReadFrequently`), `inversionAttempts: "dontInvert"` for speed.
* The moment a QR is decoded, a **scan lock** is set — the decoder stops and the camera is released
  *before* any Firebase call, so exactly **one** Firestore request runs per code.
* Uploaded images are downscaled to ≤1000 px and decoded once.
* The decode loop never dies silently: if the session is not resolved yet, the frame is ignored and
  scanning continues; the loop is only stopped by the lock, cancel/back, background, or unmount.

## H. Camera lifecycle fix

* `releaseCamera()` stops **every** `MediaStreamTrack`, pauses the video and clears `srcObject`;
  `stopDecodeLoop()` cancels the `requestAnimationFrame`; `releaseEverything()` runs both.
* Teardown runs on: **Cancel**, **Back**, route change/unmount, `visibilitychange → hidden`,
  `pagehide`, `beforeunload`, and on **success** (camera stops before navigation).
* Re-entry resumes only when no scan is locked; a locked error state requires the explicit
  **“Scan Again”** button, which resets the lock and restarts the camera + decoder.
* Camera/video/canvas layers are `pointer-events-none` (canvas is `hidden`), the control bar is
  `z-20 pointer-events-auto`, so overlays can never swallow taps on Flashlight / Upload / Cancel.
* Camera start is idempotent (an existing live stream is reused) and refuses to run on
  non-HTTPS origins, with a clear in-page fallback message.

## I. Cancel / back behaviour

Cancel (both the footer button and the header chevron) is a real navigation that calls
`releaseEverything()` first, so the camera light goes off immediately and no listener survives the
route change. The same teardown runs on browser back, tab switch and page unload. There is no path
that leaves a decoder loop or MediaStream behind.

## J. One QR = one run / no duplicates

`scanLockRef` is set synchronously when a code is decoded and is cleared **only** by “Scan Again”.
A second tap or a second detection cannot re-enter the handler, and no Firestore call can be issued
while the lock is held. The stamp itself is idempotent at the data layer (`visitCounted` +
`lastVisitTransactionId` replay, plus the transaction-document id), so even a duplicated request
cannot double-count a visit or add two stamps for the same transaction id.

## K. “Switch Client Tenant” removed

The tenant-switching concept is gone: no selector, no dropdown, no fake tenant list, no
`localStorage`/query-string tenant, no handler, no route. The URL slug is not a tenant — if it does
not match the assigned `clientId` the app simply replaces it with the canonical
`/staff/{clientId}/...` route. No other business was deleted from Firebase; staff simply cannot
switch to one.

## L. One staff = one business

`staffUsers/{uid}` is the only assignment source. `validateStaffRecord()` yields exactly one
`clientId` (a legacy single-entry `clientIds[]` is tolerated). Every service call resolves the
session first and asserts that documents it touches carry the same `clientId`; foreign documents are
rejected (`CROSS_BUSINESS`) rather than silently dropped. Customer searches always run as
`where("clientId", "==", staffClientId)` — never fetch-all-then-filter.

## M. Notifications — path, writes, security

* Path: `clients/{clientId}/notifications/{notificationId}` with
  `{ clientId, type, title, message, customerId, read, staffUid, metadata, createdAt }`,
  `createdAt: serverTimestamp()`, `read: false`.
* Types: `REWARD_READY`, `STAMP_ADDED`, `REWARD_REDEEMED`, `SYSTEM` — real, event-driven only
  (a stamp emits a stamp event; unlocking emits a reward-ready event; a redemption emits a redeemed
  event). No demo copy exists anywhere in the source.
* Listener: `orderBy("createdAt", "desc")`, `limit(20)`, scoped to the session `clientId`, with an
  unsubscribe on unmount; the unread badge is computed from Firebase data.
* Rules: staff may read only their own business's notifications; creation is limited to the four
  types, a non-empty ≤120-char title, a ≤400-char message, `read == false`, `staffUid == uid()`,
  matching `clientId` and `createdAt == request.time`; **the only mutable field is `read`**; delete
  is denied. (The old hard-coded demo bells, “Kavya is ready for reward!”, “Rahul added 1 stamp”,
  “Daily target 50% reached”, are not in the codebase.)

## N. Dashboard & activity — real data only

* Today's stamps: `clients/{clientId}/stampTransactions` queried with
  `where("createdAt", ">=", local midnight)`, ordered desc, limit 500, filtered by
  `isStampLedgerEntry()` so redemptions are excluded — a live Firestore listener, no fixed window.
* Today's customers: `count()` of `customers` with `clientId ==` **and**
  `createdAt >= local midnight`; if that count cannot be read (missing index / rules) the card shows
  **“—”** instead of a wrong number (`customersAvailable`).
* Reviews: `count()` over `clients/{clientId}/reviews`; shows “—” when unreadable
  (`reviewsAvailable`).
* Rewards redeemed: `count()` over `clients/{clientId}/rewardRedemptions`.
* Recent activity: `clients/{clientId}/stampTransactions` ordered desc, limit 30 → real ledger rows.
* Empty/error states are explicit; no hard-coded metrics, no demo activity, no fake numbers.

## O. Files changed

```
firestore.rules                                  (project ruleset: +notifications, +audit/counters)
firestore.indexes.json                           (customers: clientId+name, clientId+createdAt)
firebase.json, .firebaserc                       (deploy wiring → project cafe-review7)
.env.example                                     (six NEXT_PUBLIC_FIREBASE_* vars, no DATABASE_URL)
package.json                                     (test + verify scripts)
scripts/verify-production-readiness.mjs          (29 static production checks)
tests/{clientConfig,firestorePaths,qrPayload,staffErrors}.test.mjs
src/lib/{firebase,firebaseConfig}.ts
src/app/api/health/route.ts
src/app/staff/login/page.tsx
src/app/staff/[clientSlug]/{page,scan/page,customers/page,customers/[customerId]/page,
                           rewards/page,activity/page,settings/page}.tsx
src/components/{StaffShell,StaffHeader,StaffDrawer,BottomNav,DesktopSidebar}.tsx
src/context/StaffAppContext.tsx
src/services/{firebaseService,clientConfig,staffErrors,firestorePaths,qrPayload,types}.ts
docs/STAFF-APP-FIX-REPORT.md                     (this report)
```

## P. Tests added

* `tests/clientConfig.test.mjs` — canonical `loyalty.*` schema (the login bug), legacy fallbacks,
  staff-record validation (inactive / no clientId / multi-business), staff user mapping, loyalty
  ownership, **`visitBaseline()` rules parity**, **stamp-vs-redemption ledger classification**.
* `tests/staffErrors.test.mjs` — exact copy for every failure case, Firebase-code mapping
  (permission-denied, unavailable, deadline, auth codes, API-key), and the guarantee that a
  permission/network failure can never render the configuration message.
* `tests/firestorePaths.test.mjs` — canonical paths only (ledgers nested under the business), unsafe
  id rejection.
* `tests/qrPayload.test.mjs` — canonical `?ct=` URLs, legacy shapes, invalid payloads.
* `scripts/verify-production-readiness.mjs` — 29 static checks over the whole app (project id, env
  vars, no dummy credentials, no Postgres/Drizzle/DATABASE_URL, auth chain order, no `clientId` from
  URL/storage, no tenant switcher, canonical paths, rules least-privilege, two-phase visit write,
  scoped daily metrics, scanner teardown/lock, no demo data, exact error copy, untouched login/theme
  tokens).

## Q. Test results

```
npm test     → 27 tests, 27 pass, 0 fail
npm run verify → 29/29 production-readiness checks passed
```

## R. lint / typecheck / build

```
npm run lint      → eslint .                      → 0 problems
npm run typecheck → tsc --noEmit                  → 0 errors
npm run build     → next build (Turbopack)        → Compiled successfully, 12 routes
```

## S. Vercel compatibility

* Deployment needs **no** database: Firebase only, exactly six environment variables
  (`NEXT_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._STORAGE_BUCKET`,
  `..._MESSAGING_SENDER_ID`, `..._APP_ID`). Set them in **Vercel → Settings → Environment
  Variables** (the committed `.env` is gitignored).
* `NEXT_PUBLIC_FIREBASE_PROJECT_ID` must be `cafe-review7`; a placeholder/dummy value fails loudly
  with `Staff Firebase configuration could not be loaded.` instead of connecting to a wrong project.
* The app is a standard Next.js App Router build (client-side Firebase SDK); no server runtime
  requirements, no `DATABASE_URL`, no PostgreSQL/Drizzle (verified by the readiness script).
* `GET /api/health` reports expected/actual projectId, missing or placeholder keys and the canonical
  path list — useful immediately after a deploy.

## T. Rules & indexes that must be deployed (required action)

The project currently has two competing rulesets deployed from different repositories. The one in
force **lacks `clients/{clientId}/notifications`** (and the admin variant also lacks
`customerTokens`), which is the second cause of `Missing or insufficient permissions.`.

This repository now carries the **project ruleset** — the canonical Customer-App ruleset (strict,
staff-aware: `staffClientId()`, `isStaffOf()`, +1-only visit counting, `visitCounted` once,
`customerTokens` staff `get` for the owning business) **plus** the staff notifications block **plus**
the admin audit/counter blocks (`activityLogs`, `metricsDaily`), so deploying it cannot break the
customer or admin apps.

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project cafe-review7
```

Indexes shipped: `customers (clientId ASC, name ASC)` for name search and
`customers (clientId ASC, createdAt ASC)` for today's-customer count. Without the second index,
today's customers correctly shows “—” (no wrong number).

## U. Remaining issues / caveats

1. **Rules + indexes must be deployed** (see **T**) — the sandbox cannot reach Google endpoints, so
   deployment and live verification must be done by the operator.
2. Legacy demo documents: if old demo notifications/activity rows still exist as *documents* in
   Firestore, they will be listed (the app no longer creates or ships them). Delete leftovers once
   in the Firebase console; the new rules prevent any non-canonical notification from being created.
3. Staff accounts must have `status: "ACTIVE"` (the value the live rules check) and a `clientId`;
   anything else now produces the precise message from **X** instead of a generic error.
4. `stampTransactions` rows written by old builds may lack `type`/`delta`; they are treated as stamps
   for the daily count (conservative, real data).
5. Reviews metric depends on the `clients/{clientId}/reviews` read permission; where it is denied the
   card shows “—” (never a fake 0).

## V. How to verify in production (≈5 minutes)

1. Deploy rules + indexes (**T**), set the six env vars in Vercel, redeploy.
2. Open `/api/health` → `projectId` must equal `cafe-review7`, no missing/placeholder keys.
3. Sign in with a valid staff account → dashboard opens at `/staff/{assignedClientId}` with real
   metrics; the URL slug is corrected automatically; there is no tenant selector.
4. Scan a customer QR → one Firestore lookup, camera stops, customer page opens.
5. Add a stamp → verify `clients/{clientId}/stampTransactions/{id}` has the new row
   (`visitCounted: true`, `staffId == your uid`), `customers/{id}.totalVisits` incremented by exactly
   one and `lastVisitTransactionId` set; press again (double tap) → no double count.
6. Redeem the reward at target → `clients/{clientId}/rewardRedemptions/{id}` row + loyalty reset +
   a `REWARD_REDEEMED` notification (badge increments live).
7. Sign in with a staff account of another business and scan the same pass → “This customer belongs
   to another business.” and no customer data is read.

## W. 42-point verification summary

| Group | Points | Status |
| --- | --- | --- |
| Auth 1–13 | distinct messages, no race, sign-out on failure, no dashboard without clientId, no `clientId` from URL/storage, no tenant switching, one business | ✅ |
| Scanner 14–24 | throttled decode, downscale, one request per code, lock + explicit restart, full teardown, controls not covered, correct QR flow | ✅ |
| Lookup / stamp / loyalty 25–33 | scoped search (name/phone/id), canonical ledger + visit fields, atomic + idempotent, no state mutation in the transaction, `loyaltyAccounts/{customerId}` with ownership checks, rewards with eligibility + duplicate checks | ✅ |
| Notifications / dashboard 34–41 | canonical path, real events only, rules (read own business, update `read`), ordered listener + cleanup, unread badge from Firebase, real metrics/activity | ✅ |
| Build 42 | install / lint / typecheck / build / tests / readiness | ✅ |

## X. Exact message mapping

| Condition | Message |
| --- | --- |
| `staffUsers/{uid}` missing | Staff account not found. |
| Staff inactive | Your staff account is inactive. |
| No `clientId` on the staff record | Your staff account is not assigned to a business. |
| `clients/{clientId}` missing | Assigned business could not be found. |
| Firestore `permission-denied` | Your staff account does not have permission for this business. |
| Network / `unavailable` / `deadline-exceeded` | Connection problem. Please try again. |
| Firebase config missing/placeholder/wrong project | Staff Firebase configuration could not be loaded. |
| Customer missing | Customer not found. |
| QR/token belongs to another business | This customer belongs to another business. |
| Invalid / unknown QR token | Invalid customer QR code. |
| Firebase Auth rejection | Invalid email or password. |

## Y. Canonical paths enforced everywhere

`staffUsers/{uid}` · `clients/{clientId}` · `customers/{customerId}` · `customerTokens/{token}` ·
`loyaltyAccounts/{customerId}` · `clients/{clientId}/stampTransactions/{transactionId}` ·
`clients/{clientId}/rewardRedemptions/{redemptionId}` ·
`clients/{clientId}/notifications/{notificationId}` · `clients/{clientId}/reviews/{reviewId}`.

No legacy top-level ledger, no duplicate collection, no client-supplied tenant.

## Z. Sign-off

The reported login error had a genuine code cause and is fixed at the source; permission failures are
no longer produced by the stamp flow and are never masked; the scanner is throttled, locked, and torn
down deterministically; the tenant switch no longer exists; demo notifications are gone from the app;
all metrics, activity and notifications now come from real, business-scoped Firestore data; lint,
typecheck, build, 27 unit tests and 29 readiness checks pass. Production readiness is confirmed by
the operator once the rules and indexes in **T** are deployed.
