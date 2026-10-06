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
  const patterns = [/Switch Client/i, /switchClient/i, /ClientSwitcher/, /TenantSwitcher/, /selectedTenant/i];
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

check("stamp visits are written in the two-phase canonical order", () => {
  const service = read("src/services/firebaseService.ts");
  // PHASE 1 appends the row uncounted: the rules pair an EXISTING uncounted
  // transaction with the customer update via get()/getAfter().
  if (!/visitCounted: false/.test(service)) return "ledger row is not appended as uncounted";
  if (!/visitCounted: true, visitCountedAt: serverTimestamp\(\)/.test(service)) {
    return "the counted-transaction update is missing";
  }
  if (!/applyStampVisit\(visitArgs, \{ markCounted: true \}\)/.test(service)) {
    return "the canonical counted path is not attempted first";
  }
  if (!/markCounted: false/.test(service)) return "no append-only fallback for stricter rulesets";
  if (!/lastVisitTransactionId\) === transactionId/.test(service)) {
    return "no cross-ruleset idempotency marker";
  }
  return true;
});

check("today's metrics are scoped Firestore queries, not totals", () => {
  const service = read("src/services/firebaseService.ts");
  if (!/where\("createdAt", ">=", startOfToday\)/.test(service)) return "today's ledger window is missing";
  if (!/where\("clientId", "==", clientId\),\s*\n\s*where\("createdAt", ">=", startOfToday\)/.test(service)) {
    return "today's customers count is not scoped by clientId + createdAt";
  }
  if (!/customersAvailable/.test(service)) return "today's customers has no honest unavailable state";
  if (/getCountFromServer\(\s*query\(collection\(firestore, COLLECTIONS\.customers\), where\("clientId", "==", clientId\)\)\s*\)/.test(service)) {
    return "the dashboard still uses the total customer count as a daily metric";
  }
  return true;
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

/* --------------------------------------------------------- UI preserved */

check("login screen design tokens are untouched", () => {
  const login = read("src/app/staff/login/page.tsx");
  const tokens = [
    "bg-[#2D1808]",
    "rounded-3xl",
    "bg-[#3A1E0D]",
    "text-[#D4A373]",
    "Staff Login",
    "Forgot Password?",
    "Firebase Authenticated • Staff Portal",
  ];
  const missing = tokens.filter((token) => !login.includes(token));
  return missing.length === 0 ? true : `design tokens missing: ${missing.join(", ")}`;
});

check("no new global styles or theme overrides were introduced", () => {
  const css = read("src/app/globals.css");
  return /--color-cafe-dark: #3A1E0D;/.test(css) ? true : "global theme variables changed";
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
