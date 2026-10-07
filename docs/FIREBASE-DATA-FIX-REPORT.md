# Staff Firebase data-access fix report

**Date:** 2026-10-07 (Asia/Calcutta)
**Branch:** `arena/632170d9-cafe-review-staff`
**Firebase project:** `cafe-review7`

## Status at handoff

The source, tests, and deployment wiring are updated. **No rules or indexes were deployed.** The requested Firebase deploy command failed before deployment because Firebase CLI has no authenticated account in this environment (`Failed to authenticate, have you run firebase login?`). Production rules/indexes could not be retrieved or compared, and no authenticated staff account was available for a production smoke test. Therefore the live production denial/root cause remains unconfirmed; the checks below establish source-level request/rule/index alignment only.

## Exact request and authorization paths

### Notifications

- Listener: `onSnapshot` on `clients/{session.clientId}/notifications`, ordered by `createdAt desc`, limited to 20.
- The listener starts through the canonical ready-session gate and is unsubscribed on cleanup.
- `session.clientId` comes only from `staffUsers/{Firebase Auth UID}.clientId`; there is no URL, local-storage, query-string, QR, or `clientIds[]` fallback.
- The nested notification rule grants reads only through `isStaffOf(clientId)`. Creation is schema-checked and scoped to that business; update may change only `read`; delete is denied.
- Listener and mark-read failures retain distinct permission, missing-index, network, not-found, and unknown error mappings and use the existing notification error UI.

### Customer lookup

- Directory, exact ID/code/UID/phone searches, phone-index-field searches, and name-prefix searches are all built with `where("clientId", "==", staffClientId)` before their search constraints.
- Browse/search requests remain bounded; the name-index fallback only scans a limited page already scoped to that `clientId`. There is no global customer enumeration.
- Direct document-ID reads are document gets, not list/search queries, and remain protected by the same-business customer rule and client ownership validation.
- Existing registration, phone-index, and QR ownership rules were not relaxed. QR payload slugs remain diagnostic only; the authenticated staff assignment controls access.

### Dashboard count

The current card is **“Customers · new today”**, not an all-time total-customer card; its label and layout were not changed. Its server count query is scoped by `clientId` and bounded to the local-day interval (`createdAt >= local midnight`, `createdAt < next local midnight`), with ascending `createdAt` ordering. The source index definition is `customers: clientId ASC, createdAt ASC`; the nine collection-scope customer composites cover `createdAt`, `name`, document ID (`__name__`), `uid`, `code`, `customerCode`, `normalizedPhone`, `phone`, and `phoneIndexId`, each paired with `clientId ASC`. The notification listener only orders by `createdAt desc`; Firestore's default single-field index is sufficient, so no notification composite is required. A successful zero count displays `0`; an unavailable count displays `—` and the existing error state. Other dashboard metrics likewise display `—` when unavailable rather than presenting a failure as zero.

## Stamp, loyalty, reward, and notification integrity

- A stamp first creates an uncounted idempotency ledger row. A second transaction marks that existing row counted while incrementing the customer's visit count and updating loyalty atomically. It writes the final stamp counts in that transaction so concurrent stamps do not leave stale ledger balances. Same-key retries cannot count a visit twice; pending ledger rows are excluded from completed activity and stamp metrics.
- Loyalty-account creation/update rules bind the balance change to the matching counted stamp visit, or to a matching atomic reward redemption. Reward redemption, activity, and loyalty changes are linked by the redemption ID; redemption records are create-only. Excess stamps are preserved and reward eligibility reflects the remaining balance.
- Stamp/reward notification writes use the scoped notification subcollection; mark-read updates only `read`.

These are source/rules contracts. They have **not** been exercised against production or a Firestore Emulator.

## Files changed

- `src/services/firebaseService.ts`, `src/services/firestoreQueries.ts`, `src/services/staffSession.ts`, `src/services/clientConfig.ts`, `src/services/staffErrors.ts`, `src/services/types.ts`
- `src/app/staff/[clientSlug]/page.tsx`, customer lookup/detail pages, `src/components/StaffHeader.tsx`, and `src/context/StaffAppContext.tsx`
- `firestore.rules`, `firestore.indexes.json`, `scripts/verify-production-readiness.mjs`
- Added query/session/security-contract tests and updated identity, error, and idempotency tests.

`firebase.json` still points to the root `firestore.rules` and `firestore.indexes.json`; `.firebaserc` defaults to `cafe-review7`.

## Validation completed

- `npm install` — passed; npm reported **6 high-severity audit findings**. No forced audit fix was applied.
- `npm test` — **62 passed, 0 failed**.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build` — passed.
- `npm run verify` — **33/33** static readiness checks passed.
- Firebase Emulator — `npx firebase-tools emulators:exec --only firestore --project demo-staff-rules ...` was attempted and failed with `Could not spawn java -version`; Java is absent. Firestore rules compilation is therefore **not completed**. Delimiter/static contract checks are not a rules compiler.
- Firebase CLI auth recheck: `login:list` returned no account details; `projects:list` failed with `Failed to authenticate, have you run firebase login?`.
- Requested deployment: `npx firebase-tools deploy --only firestore:rules,firestore:indexes --project cafe-review7` — **not deployed**, CLI authentication failed before deployment. No rules or index build status was retrieved.
- Production test — **not possible in this environment**: Firebase CLI could not authenticate and no real staff login session was available. No production success is claimed.
- `npm audit --omit=dev` — **0 production vulnerabilities**. The six high package findings are development-only: direct dev `eslint-config-next@16.3.8` → `@next/eslint-plugin-next@16.3.8` → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3`, plus direct dev `postcss@8.5.8`. The installed Next runtime has nested `postcss@8.5.23`, and the production-only audit is clean. No audit fix was applied; npm's suggested `eslint-config-next@14.2.35` is a major downgrade incompatible with the Next 16 toolchain.

## Next production steps

Reconnect Firebase CLI authorization in Arena, rerun the deploy command above, wait for required indexes to finish building, then test with a real staff account: canonical session resolution, scoped notification read/mark-read/create, customer ID/phone/name search, exact customer count, one stamp and same-key retry, reward eligibility/redemption, and activity/notification updates. Verify both the deployed rules/index state and the resulting records before calling the production issue resolved.
