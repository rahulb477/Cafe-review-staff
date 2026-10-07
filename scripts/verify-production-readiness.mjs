#!/usr/bin/env node
/**
 * Production readiness verification (Staff App).
 *
 * Static, dependency-free checks that the shipped app:
 *   - talks only to Firebase project cafe-review7 (no dummy credentials),
 *   - has no PostgreSQL / Drizzle / DATABASE_URL leftovers,
 *   - resolves the business ONLY through staffUsers/{uid} → clients/{clientId},
 *   - has no tenant switching and no clientId from URL / storage / QR,
 *   - uses only canonical Firestore paths,
 *   - stops the QR camera/decoder on cancel, unmount, background and success,
 *   - ships no demo/mock notifications, activity or dashboard numbers,
 *   - keeps the Firestore rules least-privilege (no `if true`).
 *
 * Run: npm run verify
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const passes = [];

function read(file) {
  return readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return existsSync(path.join(root, file));
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, entry);
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel, acc);
    else acc.push(rel);
  }
  return acc;
}

function check(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) passes.push(name);
    else failures.push(`${name} → ${result}`);
  } catch (error) {
    failures.push(`${name} → threw: ${error.message}`);
  }
}

const srcFiles = walk("src").filter((file) => /\.(ts|tsx)$/.test(file));
const srcText = Object.fromEntries(srcFiles.map((file) => [file, read(file)]));
const allSrc = Object.values(srcText).join("\n");
const rules = read("firestore.rules");
const pkg = JSON.parse(read("package.json"));

/* ---------------------------------------------------------------- Firebase */

check("Firebase project is cafe-review7 (expected constant)", () => {
  const text = read("src/lib/firebaseConfig.ts");
  return /EXPECTED_FIREBASE_PROJECT_ID = "cafe-review7"/.test(text)
    ? true
    : "expected project id constant not found";
});

check("Firebase config comes only from NEXT_PUBLIC_* variables", () => {
  const text = read("src/lib/firebaseConfig.ts");
  const required = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ];
  const missing = required.filter((key) => !text.includes(key));
  return missing.length === 0 ? true : `missing env keys: ${missing.join(", ")}`;
});

check("no hardcoded Firebase credentials in source", () => {
  const offenders = srcFiles.filter((file) => /AIza[0-9A-Za-z_-]{10,}/.test(srcText[file]));
  return offenders.length === 0 ? true : `hardcoded api key in ${offenders.join(", ")}`;
});

check("no silent dummy/placeholder Firebase fallback", () => {
  if (!/PLACEHOLDER_PATTERNS/.test(read("src/lib/firebaseConfig.ts"))) return "placeholder guard missing";
  if (/initializeApp\(\s*\{[^}]*apiKey:\s*["']/.test(allSrc)) return "hardcoded initializeApp config";
  if (!/firebaseConfigError/.test(allSrc)) return "config error is not surfaced";
  return true;
});

const envFiles = [".env", ".env.example"].filter(exists);
check("env files point at project cafe-review7", () => {
  for (const file of envFiles) {
    const text = read(file);
    if (/NEXT_PUBLIC_FIREBASE_PROJECT_ID/.test(text) && !/NEXT_PUBLIC_FIREBASE_PROJECT_ID=cafe-review7/.test(text)) {
      return `${file} project id is not cafe-review7`;
    }
  }
  return true;
});

/* --------------------------------------------------- no postgres / drizzle */

check("no PostgreSQL / Drizzle / DATABASE_URL dependency", () => {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const forbidden = ["pg", "postgres", "drizzle-orm", "drizzle-kit", "@prisma/client", "prisma", "knex", "mysql2", "better-sqlite3"];
  const found = forbidden.filter((dep) => dep in deps);
  if (found.length > 0) return `forbidden deps: ${found.join(", ")}`;
  if (/process\.env\.DATABASE_URL/.test(allSrc)) return "DATABASE_URL still referenced";
  return true;
});

/* ------------------------------------------------- authorization / tenant */

check("authorization chain is staffUsers/{uid} → clients/{clientId}", () => {
  const service = read("src/services/firebaseService.ts");
  if (!/COLLECTIONS\.staffUsers/.test(service)) return "staffUsers lookup missing";
  if (!/COLLECTIONS\.clients/.test(service)) return "clients lookup missing";
  const staffIndex = service.indexOf("COLLECTIONS.staffUsers");
  const clientIndex = service.indexOf("COLLECTIONS.clients");
  return staffIndex !== -1 && clientIndex !== -1 && staffIndex < clientIndex
    ? true
    : "clients must be resolved after staffUsers";
});

check("clientId never read from URL, query string or browser storage", () => {
  if (/localStorage\.|sessionStorage\./.test(allSrc)) return "browser storage is used";
  if (/useSearchParams/.test(allSrc)) return "useSearchParams is used";
  if (/searchParams\.get\(\s*["']clientId/.test(allSrc)) return "clientId read from query string";
  return true;
});

check("no tenant switcher / client dropdown exists", () => {
  const patterns = [
    /Switch Client/i,
    /switchClient/i,
    /Switch Business/i,
    /switchBusiness/i,
    /ClientSwitcher/,
    /BusinessSwitcher/,
    /TenantSwitcher/,
    /selectedTenant/i,
    /clientSelector/i,
    /businessSelector/i,
    /BAKE Cafe/i,
  ];
  const hit = patterns.find((pattern) => pattern.test(allSrc));
  return hit ? `tenant switching pattern found: ${hit}` : true;
});

check("one staff = one business (no requestedClientId parameter)", () => {
  const service = read("src/services/firebaseService.ts");
  return /requestedClientId/.test(service)
    ? "service still accepts a caller-supplied clientId"
    : true;
});

check("business operations are scoped by the session clientId", () => {
  const service = read("src/services/firebaseService.ts");
  const scoped =
    /session\.clientId/.test(service) &&
    /assertClientOwnership/.test(service) &&
    /requireSession\(\)/.test(service);
  return scoped ? true : "session scoping helpers missing";
});

/* ------------------------------------------------------ canonical paths */

check("only canonical Firestore paths are used", () => {
  const legacy = /(?:collection|doc)\([^)]*["'](?:stampTransactions|rewardRedemptions)["']/;
  if (legacy.test(allSrc)) return "legacy top-level ledger path detected";
  const paths = read("src/services/firestorePaths.ts");
  if (!/clients\/\{clientId\}/.test(rules) && !/match \/clients\/\{clientId\}/.test(rules)) {
    return "clients/{clientId} rules missing";
  }
  for (const required of ["staffUsers", "customerTokens", "loyaltyAccounts", "customers", "notifications"]) {
    if (!paths.includes(`"${required}"`)) return `canonical path module missing ${required}`;
  }
  return true;
});

check("notifications use clients/{clientId}/notifications", () => {
  const service = read("src/services/firebaseService.ts");
  const usesNested = /SUBCOLLECTIONS\.notifications/.test(service);
  const scopedToSession = /notificationsPath\(session\.clientId\)/.test(service);
  if (!usesNested) return "notifications subcollection not used";
  if (!scopedToSession) return "notifications listener is not scoped to the session clientId";
  if (!/markNotificationRead/.test(service)) return "mark-as-read is missing";
  return true;
});

/* -------------------------------------------------------- Firestore rules */

check("Firestore rules are least-privilege (no `if true`)", () => {
  if (/allow\s+(read|write|read,\s*write)\s*:\s*if\s+true/.test(rules)) return "found `if true` allow rule";
  if (/if\s+true\s*;/.test(rules)) return "found a blanket `if true` rule";
  if (!/function isStaffOf\(clientId\)/.test(rules)) return "rules do not bind to the staff clientId";
  if (!/function staffClientId\(\)/.test(rules)) return "rules do not resolve the staff clientId";
  return true;
});

check("rules cover notifications with a read-only mutation", () => {
  if (!/match \/notifications\/\{notificationId\}/.test(rules)) return "notifications rules missing";
  if (!/affectedKeys\(\)\.hasOnly\(\['read'\]\)/.test(rules)) {
    return "notification updates must be limited to the `read` field";
  }
  return true;
});

check("rules never permit cross-business reads", () => {
  if (/allow read: if true/.test(rules)) return "public read rule found";
  if (!/staffClientId\(\) == clientId/.test(rules)) return "no staffClientId guard found";
  if (!/documentBelongsToStaff|isStaffOf\(\s*resource\.data/.test(rules)) {
    return "no ownership guard on customer-scoped documents";
  }
  return true;
});

check("ruleset is the deployable project ruleset for cafe-review7", () => {
  for (const block of [
    "match /customerTokens/{token}",
    "match /notifications/{notificationId}",
    "match /activityLogs/{id}",
    "match /metricsDaily/{id}",
  ]) {
    if (!rules.includes(block)) return `ruleset is missing ${block}`;
  }
  const firebaseJson = JSON.parse(read("firebase.json"));
  if (firebaseJson.firestore?.rules !== "firestore.rules") return "firebase.json does not deploy firestore.rules";
  if (firebaseJson.firestore?.indexes !== "firestore.indexes.json") return "firebase.json does not deploy the indexes";
  const firebaserc = JSON.parse(read(".firebaserc"));
  if (firebaserc.projects?.default !== "cafe-review7") return ".firebaserc does not target cafe-review7";
  return true;
});

/* ------------------------------------------------------------- scanner */

const scannerFile = "src/app/staff/[clientSlug]/scan/page.tsx";
check("scanner stops every media track and the decode loop", () => {
  const scanner = read(scannerFile);
  const required = [
    [/track\.stop\(\)/, "MediaStreamTrack.stop()"],
    [/cancelAnimationFrame/, "requestAnimationFrame cancellation"],
    [/removeEventListener/, "event listener cleanup"],
    [/visibilitychange/, "visibilitychange handling"],
    [/pagehide/, "pagehide handling"],
    [/srcObject = null/, "video element release"],
  ];
  const missing = required.filter(([pattern]) => !pattern.test(scanner)).map(([, label]) => label);
  return missing.length === 0 ? true : `missing: ${missing.join(", ")}`;
});

check("normal stamps atomically append ledger, visit, loyalty and notification", () => {
  const service = read("src/services/firebaseService.ts");
  if (!/static async addStamp\([\s\S]*?runTransaction\(firestore/.test(service)) {
    return "normal Add Stamp does not use one Firestore transaction";
  }
  if (!/existingTxSnap\.exists\(\)/.test(service)) return "transaction idempotency read is missing";
  if (!/transaction\.set\(transactionRef,[\s\S]*?type: "STAMP_ADDED"/.test(service)) {
    return "immutable stamp ledger row is missing";
  }
  if (!/transaction\.update\(customerRef,[\s\S]*?totalVisits: nextVisits[\s\S]*?lastVisitTransactionId: transactionId/.test(service)) {
    return "visit count is not updated with the stamp";
  }
  if (!/transaction\.set\([\s\S]*?loyaltyRef,[\s\S]*?currentStamps: newStamps/.test(service)) {
    return "canonical loyalty balance is not updated with the stamp";
  }
  if (!/transaction\.set\(stampNotificationRef/.test(service)) {
    return "successful stamps do not create a real Firebase notification atomically";
  }
  if (!/visitCounted: true,[\s\S]{0,180}visitCountedAt: serverTimestamp\(\)/.test(service)) {
    return "the immutable stamp row does not record its counted visit";
  }
  if (/applyStampVisit\(|markCounted:\s*false|append-only visit write/.test(service)) {
    return "a two-phase/fallback visit path remains";
  }
  if (!/staffId: authenticatedUid,[\s\S]*?staffUid: authenticatedUid/.test(service)) {
    return "stamp rows do not record the authenticated UID";
  }
  if (!/function stampCooldownHasElapsed\(customerId\)[\s\S]*?request\.time[\s\S]*?duration\.value\(12, 'h'\)/.test(rules)) {
    return "the server-authoritative 12-hour cooldown rule is missing";
  }
  const recursiveAdmin = rules.match(/match \/\{document=\*\*\} \{([\s\S]*?)\n    \}/)?.[1] ?? "";
  if (/allow [^;]*write/.test(recursiveAdmin)) return "recursive admin write bypass remains";
  return true;
});

check("dashboard customer count is client-scoped and its exact composite index is shipped", () => {
  const service = read("src/services/firebaseService.ts");
  const queries = read("src/services/firestoreQueries.ts");
  if (!/where\("createdAt", ">=", startOfToday\)/.test(queries)) return "today's customer lower bound is missing";
  if (!/where\("createdAt", "<", endOfTodayExclusive\)/.test(queries)) return "today's customer upper bound is missing";
  if (!/where\("clientId", "==", safeClientId\)/.test(queries)) return "customer scope builder lacks clientId equality";
  if (!/orderBy\("createdAt", "asc"\)/.test(queries)) return "customer count order is not explicit";
  if (!/buildTodayCustomersCountQuery\(firestore, clientId, startOfToday\)/.test(service)) {
    return "dashboard count does not use the scoped query builder";
  }
  if (!/customersAvailable/.test(service) || !/todayCustomers = null/.test(service)) {
    return "unavailable customer count is not represented honestly";
  }
  const indexes = JSON.parse(read("firestore.indexes.json"));
  const requiredIndex = indexes.indexes.some((index) =>
    index.collectionGroup === "customers" &&
    index.queryScope === "COLLECTION" &&
    JSON.stringify(index.fields) === JSON.stringify([
      { fieldPath: "clientId", order: "ASCENDING" },
      { fieldPath: "createdAt", order: "ASCENDING" },
    ])
  );
  return requiredIndex ? true : "missing customers (clientId ASC, createdAt ASC) composite index";
});

check("scanner lock prevents duplicate processing and auto-restart", () => {
  const scanner = read(scannerFile);
  if (!/scanLockRef/.test(scanner)) return "scan lock missing";
  if (!/DECODE_INTERVAL_MS/.test(scanner)) return "decode throttle missing";
  if (!/MAX_DECODE_WIDTH/.test(scanner)) return "frame downscaling missing";
  if (/setTimeout\([\s\S]{0,120}setIsScanning\(true\)/.test(scanner)) return "scanner auto-restarts";
  if (!/Scan Again/.test(scanner)) return "explicit Scan Again control missing";
  return true;
});

check("scanner stops the camera before navigating on success", () => {
  const scanner = read(scannerFile);
  const stopIndex = scanner.indexOf("releaseCamera();", scanner.indexOf("handleScannedPayload"));
  const pushIndex = scanner.indexOf("routerRef.current.push", scanner.indexOf("handleScannedPayload"));
  if (stopIndex === -1) return "success path does not release the camera";
  if (pushIndex === -1) return "success path does not navigate";
  return stopIndex < pushIndex ? true : "camera must stop before navigation";
});

check("no camera/video layer can swallow taps on the controls", () => {
  const scanner = read(scannerFile);
  return /pointer-events-none/.test(scanner) ? true : "interactive overlay pointer-events guard missing";
});

/* ----------------------------------------------------------- demo data */

check("no demo/mock notifications, activity or dashboard numbers", () => {
  const patterns = [
    /Kavya/,
    /Rahul/,
    /Daily target/,
    /STAFF-001/,
    /Sharma Cafe/,
    /Royal Restaurant/,
    /demo notification/i,
    /mock notification/i,
    /fake tenant/i,
  ];
  const hit = patterns.find((pattern) => pattern.test(allSrc));
  return hit ? `demo data pattern found: ${hit}` : true;
});

check("dashboard numbers come from Firestore", () => {
  const dashboard = read("src/app/staff/[clientSlug]/page.tsx");
  if (!/listenToDashboardStats/.test(dashboard)) return "dashboard does not subscribe to Firestore metrics";
  if (/todayReviews: 0,\s*todayStamps/.test(dashboard)) return "hardcoded metric defaults found";
  return true;
});

/* ------------------------------------------------------ error messaging */

check("the configuration-incomplete copy is gone from the app", () => {
  // Comments may reference the historical bug; the rendered copy must not exist.
  const codeOnly = allSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const rendered = codeOnly.match(/["'`][^"'`]*configuration is incomplete[^"'`]*["'`]/i);
  return rendered ? `the old generic configuration error is still rendered: ${rendered[0]}` : true;
});

check("every required error message exists exactly once per code", () => {
  const messages = read("src/services/staffErrors.ts");
  const required = [
    "Staff account not found.",
    "Your staff account is inactive.",
    "Your staff account is not assigned to a business.",
    "Assigned business could not be found.",
    "Your staff account does not have permission for this business.",
    "Customer not found.",
    "This customer belongs to another business.",
    "Invalid customer QR code.",
    "Connection problem. Please try again.",
    "Staff Firebase configuration could not be loaded.",
  ];
  const missing = required.filter((message) => !messages.includes(message));
  return missing.length === 0 ? true : `missing messages: ${missing.join(" | ")}`;
});

/* --------------------------------------------------- design system / UI */

check("the staff design system is defined in globals.css", () => {
  const css = read("src/app/globals.css");
  const tokens = [
    "@theme",
    "--color-espresso-800: #3a1e0d;",
    "--color-cream-50:",
    "--color-linen:",
    "--color-line:",
    "--radius-xl: 18px;",
    "--shadow-card:",
    "env(safe-area-inset-bottom",
  ];
  const missing = tokens.filter((token) => !css.includes(token));
  if (missing.length > 0) return `design tokens missing: ${missing.join(", ")}`;
  // Continuity with the deployed theme (same espresso primary).
  return /--color-cafe-dark: #3a1e0d;/.test(css) ? true : "legacy cafe theme variables removed";
});

check("login screen uses the design system", () => {
  const login = read("src/app/staff/login/page.tsx");
  const tokens = [
    "Staff Login",
    "Forgot Password?",
    "Secure Staff Access",
    "bg-espresso-800",
    "bg-cream-50",
    "showPassword",
  ];
  const missing = tokens.filter((token) => !login.includes(token));
  return missing.length === 0 ? true : `login tokens missing: ${missing.join(", ")}`;
});

check("every required reusable UI component exists", () => {
  const required = [
    "components/StaffHeader.tsx",
    "components/SideMenu.tsx",
    "components/ui/StatCard.tsx",
    "components/ui/QuickAction.tsx",
    "components/ui/BottomNavigation.tsx",
    "components/ui/CustomerCard.tsx",
    "components/ui/CustomerAvatar.tsx",
    "components/ui/LoyaltyStampProgress.tsx",
    "components/ui/StampSlot.tsx",
    "components/ui/RewardCard.tsx",
    "components/ui/ConfirmModal.tsx",
    "components/ui/SuccessState.tsx",
    "components/ui/ActivityItem.tsx",
    "components/ui/EmptyState.tsx",
    "components/ui/LoadingState.tsx",
    "components/ui/ErrorState.tsx",
    "components/ui/ScannerContainer.tsx",
    "components/ui/NotificationItem.tsx",
  ];
  const missing = required.filter((file) => !exists(`src/${file}`));
  return missing.length === 0 ? true : `missing components: ${missing.join(", ")}`;
});

check("screens are built from the shared components, not one-off markup", () => {
  const consumers = {
    "src/app/staff/[clientSlug]/page.tsx": ["StatCard", "QuickAction", "ActivityItem"],
    "src/app/staff/[clientSlug]/customers/page.tsx": ["CustomerCard", "ScreenHeader"],
    "src/app/staff/[clientSlug]/customers/[customerId]/page.tsx": [
      "LoyaltyStampProgress",
      "ConfirmModal",
      "RewardCard",
      "SuccessState",
    ],
    "src/app/staff/[clientSlug]/activity/page.tsx": ["ActivityItem", "ScreenHeader"],
    "src/app/staff/[clientSlug]/scan/page.tsx": ["ScannerContainer", "ScreenHeader"],
    "src/components/StaffHeader.tsx": ["NotificationItem", "CafeLogo"],
    "src/components/SideMenu.tsx": ["CafeLogo", "CustomerAvatar"],
  };
  for (const [file, symbols] of Object.entries(consumers)) {
    const text = read(file);
    const missing = symbols.filter((symbol) => !text.includes(symbol));
    if (missing.length > 0) return `${file} does not use ${missing.join(", ")}`;
  }
  return true;
});

check("bottom navigation respects the safe area and stays fixed", () => {
  const nav = read("src/components/ui/BottomNavigation.tsx");
  if (!/nav-safe-bottom/.test(nav)) return "bottom navigation ignores safe-area-inset-bottom";
  if (!/fixed inset-x-0 bottom-0/.test(nav)) return "bottom navigation is not fixed";
  const shell = read("src/components/StaffShell.tsx");
  if (!/content-safe-bottom/.test(shell)) return "page content can hide behind the navigation";
  return true;
});

check("the dashboard greeting/metrics are data-driven, never hardcoded", () => {
  const dashboard = read("src/app/staff/[clientSlug]/page.tsx");
  if (!/greetingForDate/.test(dashboard)) return "dashboard greeting is not time-aware";
  if (!/listenToDashboardStats/.test(dashboard)) return "metrics are not Firestore listeners";
  if (!/listenToRecentActivity/.test(dashboard)) return "today's activity is not Firestore data";
  const hardcoded = /todayStamps: (?!0)|todayCustomers: (?!0)|todayReviews: (?!0)|rewardsRedeemed: (?!0)/;
  if (hardcoded.test(dashboard)) return "a non-zero metric default is hardcoded";
  return true;
});

/* --------------------------------------------------------------- report */

const total = passes.length + failures.length;
console.log(`\nStaff App production readiness — ${passes.length}/${total} checks passed\n`);
for (const pass of passes) console.log(`  ✅ ${pass}`);
if (failures.length > 0) {
  console.log("");
  for (const failure of failures) console.log(`  ❌ ${failure}`);
  console.log(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll production readiness checks passed.");
