import { FirebaseOptions } from "firebase/app";
import { STAFF_ERROR_MESSAGES } from "@/services/staffErrors";

/**
 * Firebase configuration + diagnostics (no SDK side effects).
 *
 * Project: cafe-review7 — the same Firebase project used by the Customer and
 * Admin apps. There is exactly ONE Firebase project, ONE Firestore database and
 * ONE authentication system on the platform.
 *
 * No dummy credentials, no silent fallback: a missing or placeholder variable,
 * or a project that is not cafe-review7, produces a clear configuration error.
 *
 * Environment variables are referenced literally so the Next.js compiler can
 * inline them into the client bundle.
 */

export const EXPECTED_FIREBASE_PROJECT_ID = "cafe-review7";

const rawConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const REQUIRED_KEYS: Array<{ key: keyof FirebaseOptions; env: string }> = [
  { key: "apiKey", env: "NEXT_PUBLIC_FIREBASE_API_KEY" },
  { key: "authDomain", env: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" },
  { key: "projectId", env: "NEXT_PUBLIC_FIREBASE_PROJECT_ID" },
  { key: "storageBucket", env: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET" },
  { key: "messagingSenderId", env: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID" },
  { key: "appId", env: "NEXT_PUBLIC_FIREBASE_APP_ID" },
];

/** Values that indicate a placeholder/dummy credential that must never ship. */
const PLACEHOLDER_PATTERNS = [
  /dummy/i,
  /fake/i,
  /placeholder/i,
  /changeme/i,
  /your[-_\s]?(api|app|firebase|project)/i,
  /^xxx+/i,
  /replace[-_\s]?with/i,
  /example\.(com|org|net)/i,
  /^test[-_]/i,
];

const firebaseConfig: FirebaseOptions = {
  apiKey: rawConfig.apiKey,
  authDomain: rawConfig.authDomain,
  projectId: rawConfig.projectId,
  storageBucket: rawConfig.storageBucket,
  messagingSenderId: rawConfig.messagingSenderId,
  appId: rawConfig.appId,
};

export interface FirebaseConfigDiagnostics {
  ok: boolean;
  projectId: string | null;
  expectedProjectId: string;
  projectMatches: boolean;
  authDomain: string | null;
  missingKeys: string[];
  placeholderKeys: string[];
  /** Canonical message for the UI. */
  userMessage: string | null;
  /** Developer detail: variable names only — never rendered as the sole message. */
  technicalDetail: string | null;
}

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

const missingKeys: string[] = [];
const placeholderKeys: string[] = [];
for (const { key, env } of REQUIRED_KEYS) {
  const value = firebaseConfig[key];
  if (typeof value !== "string" || !value.trim()) {
    missingKeys.push(env);
    continue;
  }
  if (isPlaceholder(value)) placeholderKeys.push(env);
}

const projectId = typeof firebaseConfig.projectId === "string" ? firebaseConfig.projectId.trim() : "";
const projectMatches = projectId === EXPECTED_FIREBASE_PROJECT_ID;

const configProblem =
  missingKeys.length > 0 || placeholderKeys.length > 0 || !projectMatches
    ? [
        missingKeys.length > 0 ? `missing: ${missingKeys.join(", ")}` : null,
        placeholderKeys.length > 0
          ? `placeholder values detected: ${placeholderKeys.join(", ")}`
          : null,
        !projectMatches
          ? `projectId is "${projectId || "(unset)"}" but the platform project is "${EXPECTED_FIREBASE_PROJECT_ID}"`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

export const firebaseConfigDiagnostics: FirebaseConfigDiagnostics = {
  ok: configProblem === null,
  projectId: projectId || null,
  expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
  projectMatches,
  authDomain: typeof rawConfig.authDomain === "string" ? rawConfig.authDomain : null,
  missingKeys,
  placeholderKeys,
  userMessage: configProblem ? STAFF_ERROR_MESSAGES.FIREBASE_CONFIG : null,
  technicalDetail: configProblem,
};

/**
 * Message for the UI: exactly the specification copy. Variable names are only
 * appended outside production builds so a production screen stays clean while
 * development still fails loudly.
 */
export const firebaseConfigError: string | null = configProblem
  ? process.env.NODE_ENV === "production"
    ? STAFF_ERROR_MESSAGES.FIREBASE_CONFIG
    : `${STAFF_ERROR_MESSAGES.FIREBASE_CONFIG} (${configProblem})`
  : null;

export function isFirebaseConfigured(): boolean {
  return firebaseConfigDiagnostics.ok;
}

export { firebaseConfig };
