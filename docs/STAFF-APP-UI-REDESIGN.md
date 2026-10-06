# Staff App — UI Redesign Report

Repository: `rahulb477/Cafe-review-staff` · branch `arena/a96287f6-cafe-review-staff`
Firebase project: **`cafe-review7`** (unchanged)
Scope: **UI/UX only.** No change to the Firebase project, Authentication, Firestore
architecture, document schema, security rules, loyalty/reward/visit logic, routes or API
contracts. This document supersedes the "no UI redesign" note in
`STAFF-APP-FIX-REPORT.md`.

---

## 1. Design system

One token set now drives every screen, defined in `src/app/globals.css` under Tailwind v4's
`@theme`:

| Role | Token | Value |
| --- | --- | --- |
| Page background | `--color-linen` | `#f7f1e7` (cream / off-white) |
| Card surface | `--color-cream-50 … 400` | `#fffdfa → #e7d8c3` |
| Beige/tan surface | `--color-sand-100 … 300` | `#f0e7d9 → #d3bfa2` |
| Hairline border | `--color-line`, `--color-line-soft` | `#ecdfcd`, `#f1e7d9` |
| **Primary action** | `--color-espresso-800` | `#3a1e0d` (deep espresso brown) |
| Espresso scale | `--color-espresso-50 … 950` | `#f6efe6 → #1b0d05` |
| Accent | `--color-caramel-100 … 600` | `#fbeed9 → #96611f` |
| Stamp / activity | `--color-clay-*` | terracotta |
| Reward ready | `--color-leaf-*` | warm green |
| Error | `--color-alert-*` | warm red |
| Radius | `--radius-xs … 4xl` | 8 → 34 px (components use 12–18 px) |
| Elevation | `--shadow-hairline / card / raise / nav / sheet` | minimal, warm-tinted |

Type is a native iOS-like stack (`-apple-system`, SF Pro Text/Display) so headings stay
elegant and body copy stays compact — no webfont download, no build-time network dependency,
no layout shift.

Global behaviour added:

* `html, body { overflow-x: hidden }` — no screen can scroll horizontally.
* `body::before` — a very soft caramel radial wash plus a `.cafe-motif` coffee-bean SVG
  pattern used on espresso panels (login band, side menu header, offer card).
* Safe-area utilities: `.pt-safe`, `.pb-safe`, `.nav-safe-bottom`, `.content-safe-bottom`,
  `.cta-safe-bottom` — all built on `env(safe-area-inset-*)`.
* `.press-scale` touch feedback, `.scrollbar-none`, `.skeleton` shimmer.
* Named keyframes (`animate-scan-line`, `-fade-in`, `-rise`, `-sheet-up`, `-pop`,
  `-slide-left`, `-pulse-soft`) with a full `prefers-reduced-motion` opt-out.
* No glassmorphism, no neon, no heavy gradients, no SaaS-dashboard chrome.

`src/lib/cn.ts` merges class names with **tailwind-merge** (new dependency, 1 package).
This is required for correctness: Tailwind emits `.p-4` after `.p-3\.5`, so without merging
a component's default padding would beat a caller's override regardless of class order.

## 2. Reusable components (one visual language, not 12 one-off screens)

`src/components/ui/`

| Component | Used by |
| --- | --- |
| `Button` / `LinkButton` | every CTA; `LinkButton` uses `next/link` so navigation never reloads the Firebase session |
| `Card`, `SectionHeading` | every surface, stat, panel and list container |
| `ScreenHeader` | screens 3, 4/10, 6, 7, 9, 11, Rewards, Settings |
| `StatCard` | dashboard (screen 2) |
| `QuickAction` | dashboard quick actions |
| `BottomNavigation` | fixed bottom nav (Home · Scan · Customers · Activity · Settings) |
| `CustomerAvatar` | every avatar (initial on a warm deterministic tint) |
| `CustomerCard` | screens 9, 10 previews, Rewards queue, dashboard picker |
| `StampSlot` + `LoyaltyStampProgress` | screens 4, 6, 7, 10 — one loyalty block everywhere |
| `RewardCard` | screens 4, 7, 8, 10 (uses `loyalty.rewardImage` when present) |
| `ConfirmModal` | screens 5 and 8 |
| `Sheet` | dashboard manual-stamp picker |
| `SuccessState` | screens 6 and 7 |
| `ActivityItem` | screens 2 (compact, tappable) and 11 (timeline) |
| `EmptyState` / `LoadingState` / `ErrorState` | every list and form; `LoadingState` has skeleton rows |
| `ScannerContainer` | screen 3 camera frame, overlay, four corner brackets, state layers |
| `NotificationItem` | header notification sheet |

Rebuilt chrome: `StaffHeader` (screen 2 header + notifications), `SideMenu` (screen 12,
replaces `StaffDrawer`), `DesktopSidebar` (tablet/desktop rail mirroring the side menu),
`StaffShell` (loading gate, authorization card, safe-area content padding).
`Icons.tsx` now exposes `CafeLogo` (renders `clients/{clientId}.logo` when it is an image
URL, otherwise a warm monogram) plus the inline-SVG `CoffeeCupIllustration`,
`GiftBoxIllustration` and `CelebrationHalo`. Deleted: `BottomNav.tsx`, `StaffDrawer.tsx`.

## 3. Screens

1. **Staff Login** — warm espresso band with the café motif, logo, name and category,
   overlapping cream card, "Staff Login" heading + supporting text, labelled Email/Staff ID
   and Password fields with a visibility toggle, full-width espresso Sign In button,
   Forgot Password link (sheet), and a `ShieldCheck` + **"Secure Staff Access"** footer.
   16 px inputs so iOS never zooms on focus. No social login was added.
2. **Staff Dashboard** — see §4.
3. **Scan Customer QR** — `ScreenHeader` (back + title), large rounded preview with a warm
   dark overlay, centred detection frame with four corner brackets and an animated scan
   line, torch + Upload-QR controls pinned above every overlay layer, the instruction
   "Position the customer's QR code within the frame", flashlight / upload / Cancel below,
   plus a permission-denied state with **Allow Camera Access** and non-camera fallbacks.
4. **Customer Found** and 10. **Customer Detail / Redeem** — the *same* component: identity
   card (avatar, name, `#code`, table only when the data has one), `LoyaltyStampProgress`
   ("Loyalty Stamps", `3 / 8`, 8 slots, progress bar, "5 more stamps for Free Coffee"),
   info rows (Last Stamp, Total Visits, Customer Since, Status), a green `RewardCard` when
   eligible, and one primary button ("Add 1 Stamp" / "Mark as Redeemed").
5. **Confirm Stamp** — `ConfirmModal` bottom sheet: dimmed background, coffee illustration,
   "Add 1 Loyalty Stamp?", the customer name, `3 / 8 → 4 / 8`, espresso Confirm and cream
   Cancel. Buttons disable and show a spinner while the write is in flight.
6. **Stamp Added** — `SuccessState` with the celebration halo + coffee cup, "Stamp Added!",
   "{name} now has 4 / 8 stamps", the stamp row again, then **View Customer** and
   **Back to Scan**. A stamp that completes the card transitions straight to screen 7.
7. **Reward Unlocked** — gift illustration, "Reward Unlocked!", "This customer has completed
   8 / 8 stamps.", a `RewardCard` ("Free Coffee" / "Reward Ready for Redemption"),
   **Mark as Redeemed** (primary) and **View Customer**.
8. **Redeem Reward** — `ConfirmModal` with the customer card, the reward tile,
   "Mark this reward as redeemed?", "This will reset the customer's stamps to 0 / 8 after
   redemption.", **Confirm Redemption** / **Cancel**.
9. **Customer Lookup** — search field ("Search by customer ID…") with an espresso QR
   shortcut, All / Reward-Ready filters, and real customer rows (avatar · name · `#code` ·
   `4 / 8` · "2 mins ago").
11. **Recent Activity** — a real `<select>` filter ("All Activity" / Stamps / Rewards) and a
    timeline of ledger rows with icon, title, customer name + `#code`, time and a `+1` /
    `Redeemed` badge, newest first.
12. **Staff Side Menu** — espresso header with café logo + name, staff avatar, name and
    role, close button; Dashboard, Scan QR, Customer Lookup, Recent Activity, Rewards,
    Settings; divider; **Sign Out**.

Rewards and Settings were restyled onto the same system without changing their behaviour.

## 4. Dashboard improvements (the one screen rebuilt substantially)

* **Greeting** — time-aware "Good morning/afternoon/evening, {staffName}." with the current
  date and business name on a subtle secondary line (computed after mount so it can never
  mismatch the server render).
* **Four stat cards** — Today's Stamps, Customers, Reviews, Rewards Redeemed. Each has a
  tinted icon tile, a large tabular number, a bold label and a small caption. Skeletons
  while the listeners warm up.
* **Quick Actions** — Scan Customer QR (accented), Add Stamp Manually, Customer Lookup,
  Recent Activity; each an icon tile + title + supporting text + chevron with press feedback.
* **Today's Activity** — a live ledger preview (max 4 rows) filtered to today, each row
  tappable through to the customer, with "View all" into Recent Activity.
* **Manual stamp** — the existing shortcut is preserved: a `Sheet` lists real customers of
  this business, and a `ConfirmModal` shows `n / 8 → n+1 / 8` before calling the same
  `FirebaseService.addStamp()` write.

It stays a fast counter-side screen: four numbers, four actions, one activity preview — no
charts, no analytics sprawl.

**Every value is Firebase-derived.** `listenToDashboardStats()` supplies the metrics
(`clients/{clientId}/stampTransactions` since local midnight, `count()` over `customers`
scoped by `clientId` + `createdAt`, `count()` over `clients/{clientId}/reviews` and
`clients/{clientId}/rewardRedemptions`); `listenToRecentActivity()` supplies the preview;
`getCustomers()` supplies the picker. A metric that cannot be read renders **"—"**
(`customersAvailable` / `reviewsAvailable`) and an empty ledger renders an empty state —
never a demo number. The only literal zeros in the file are the pre-load placeholder state.

## 5. Firebase functionality — preserved

Untouched: the project/config bootstrap, Firebase Authentication, the
`staffUsers/{uid}` → `clientId` → `clients/{clientId}` resolution, the session state machine
and route canonicalization, `customerTokens/{token}` QR resolution with the
`token.clientId === staffClientId` check, `customers/{customerId}`, `loyaltyAccounts/{customerId}`,
the two-phase idempotent stamp + visit-counting write, atomic reward redemption, notification
emission/listener/mark-read, the scoped customer search, `firestore.rules`,
`firestore.indexes.json`, `firebase.json`, `.firebaserc` and `/api/health`.

Two additive, UI-serving changes only:

* `CustomerProfile.lastActivityMillis` — the newest of `lastStampAt` / `lastVisitAt` /
  `updatedAt` / `createdAt`, derived in the existing mapper. Presentation only (relative
  "2 mins ago"); nothing is written and no field is invented.
* `ClientConfig.rewardImageUrl` — maps the already-documented `clients/{clientId}.loyalty.rewardImage`
  (with a legacy flat fallback) so `RewardCard` can show real reward artwork. `null` stays
  `null` and the inline illustration is used instead.
* Customer avatar tints now come from the shared warm palette (`avatarTintFor`) instead of a
  local list that included cool blues/purples.

**No tenant switching exists anywhere.** No client/business selector, no dropdown, no
`localStorage`/query-string tenant. The readiness script now also greps for
`Switch Business`, `BusinessSwitcher`, `clientSelector`, `businessSelector` and `BAKE Cafe`.

## 6. QR scanner status

Behaviour is unchanged and remains correct; only the presentation moved into
`ScannerContainer`:

* permission request → `starting` loading state → `live`; denial renders an explicit
  `denied` state with **Allow Camera Access**, Cancel and non-camera fallbacks, so the UI is
  never a frozen overlay (unsupported browsers get their own `unsupported` state);
* decode throttled to `DECODE_INTERVAL_MS = 180 ms` on a `MAX_DECODE_WIDTH = 480 px` canvas
  with `inversionAttempts: "dontInvert"`; uploads downscaled to ≤1000 px and decoded once;
* `scanLockRef` is set synchronously on decode → decoder stopped and camera released
  **before** the Firestore call → exactly one lookup per code; only "Scan Again" clears it;
* teardown (`track.stop()`, `cancelAnimationFrame`, `srcObject = null`, `removeEventListener`)
  on Cancel, Back, unmount, `visibilitychange → hidden`, `pagehide` and `beforeunload`;
* camera/video/overlay layers are `pointer-events-none` and the control bar sits above them.

## 7. Notifications status

`clients/{clientId}/notifications/{notificationId}` via a real-time `onSnapshot` listener
(`orderBy createdAt desc`, `limit 20`), scoped to the session `clientId`, unsubscribed on
unmount. The unread badge is computed from Firestore data; tapping a row marks `read` with an
optimistic update and a tolerated failure. The panel now matches the design system: a fixed
inset sheet on mobile (never wider than the viewport) and an anchored dropdown from `sm` up,
rendered with `NotificationItem`, plus loading / error / empty states. No demo notifications
exist in the codebase.

## 8. Responsive behaviour

Verified targets: 320 / 360 / 375 / 390 / 414 px, tablet and desktop.

* `max-w-md` content column on mobile, `md:max-w-2xl`, `lg:max-w-3xl` beside the desktop rail.
* No horizontal overflow: `overflow-x: hidden` on `html`/`body`, `min-w-0` + `truncate` on
  every flexible text node, `scrollbar-none` horizontal chip rows, and the notification sheet
  sized with `inset-x-3` on mobile instead of an anchored width.
* Bottom navigation is fixed, `nav-safe-bottom` (`env(safe-area-inset-bottom)`), and `main`
  carries `content-safe-bottom` so no CTA can hide behind it.
* Modals/sheets are `max-h-[92dvh]` with an internal scroll area and a `cta-safe-bottom`
  action bar, so they never exceed the viewport and stay reachable with the keyboard open
  (`dvh` shrinks with the on-screen keyboard). Body scroll is locked while open and focus is
  moved into the sheet and restored on close; Escape closes.
* Stamp grid is 4-up on mobile / 8-up from `sm`, and adapts for targets above 8 (clamped to
  30 by `resolveStampTarget`).
* `viewport.maximumScale` is now 5 (zoom is an accessibility requirement); auto-zoom on input
  focus is avoided by using 16 px input text on mobile.

## 9. Checks

```
npm run lint      → eslint .            → 0 problems
npm run typecheck → tsc --noEmit        → 0 errors
npm run build     → next build          → Compiled successfully, 12 routes
npm test          → node --test         → 40 tests, 40 pass, 0 fail
npm run verify    → readiness script    → 33/33 checks passed
```

New tests: `tests/format.test.mjs` (12 cases — greeting, relative time, stamp fraction,
milestone copy, progress clamping, avatar tint determinism, and the honesty rules that
missing timestamps never render a fake "just now"); `tests/clientConfig.test.mjs` gained a
`loyalty.rewardImage` mapping case.

The readiness script's obsolete "UI preserved" section (which asserted the *old* login tokens
and forbade theme changes) was replaced with design-system checks: tokens present in
`globals.css`, login uses the system, all 18 required components exist, screens consume the
shared components rather than one-off markup, bottom navigation is fixed + safe-area aware,
and the dashboard greeting/metrics are data-driven with no non-zero hardcoded defaults.
All Firebase, path, rules, scanner and demo-data checks are unchanged.

Smoke run against the production build (`next start`, project `cafe-review7`, `/api/health`
reporting `projectMatches: true`): `/staff/login`, `/staff/{slug}`, `/scan`, `/customers`,
`/customers/{id}`, `/activity`, `/rewards`, `/settings` all return 200 with no server errors.

## 10. Remaining issues / caveats

1. **No reference image was attached to this task.** The redesign was implemented from the
   written specification (design system, screen-by-screen contents, component list) and from
   the `Screen 1…11` annotations already present in the codebase, which encode the same
   reference. If the image differs in a detail (exact spacing, a specific illustration),
   point it out and it is a token/component-level tweak, not a rebuild.
2. **Operator action still required (unchanged from the previous report):** deploy
   `firestore.rules` + `firestore.indexes.json` to `cafe-review7`. Without the
   `(clientId, createdAt)` index the Customers card correctly shows "—"; without the
   `customerTokens` / `notifications` rule blocks, scans and the bell return
   permission-denied. The sandbox cannot reach Google endpoints, so deployment and
   end-to-end verification against live data (login, scan, stamp, redeem, notifications)
   must be done by the operator.
3. Authenticated screens could not be exercised against live Firestore in this sandbox (no
   staff credentials), so they were verified by type-check, production build, route-level
   smoke rendering and static analysis rather than by a live click-through.
4. Legacy demo documents that already exist in Firestore would still be listed; the app
   neither creates nor ships any.
5. `tailwind-merge` was added as a runtime dependency (1 package, no transitive deps) to make
   component-level class overrides deterministic.
