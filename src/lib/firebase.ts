import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";
import {
  EXPECTED_FIREBASE_PROJECT_ID,
  firebaseConfig,
  firebaseConfigDiagnostics,
  firebaseConfigError,
  isFirebaseConfigured,
} from "./firebaseConfig";

/**
 * Firebase bootstrap for the Staff App (project cafe-review7).
 *
 * The app is client-side: `getFirebaseAuth()` / `getFirestoreDb()` return null
 * while rendering on the server, so a Vercel build never touches Firebase and
 * never needs credentials at build time.
 */

export {
  EXPECTED_FIREBASE_PROJECT_ID,
  firebaseConfig,
  firebaseConfigDiagnostics,
  firebaseConfigError,
  isFirebaseConfigured,
};

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

let cachedApp: FirebaseApp | null = null;
let initializationError: string | null = null;

/**
 * The single Firebase app instance, or null when the configuration is invalid
 * or when running on the server. Never invents fallback credentials.
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (firebaseConfigError) return null;
  if (cachedApp) return cachedApp;

  try {
    cachedApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    return cachedApp;
  } catch (error) {
    initializationError = error instanceof Error ? error.message : String(error);
    console.error("[firebase] initialization failed:", initializationError);
    return null;
  }
}

export function getFirebaseInitializationError(): string | null {
  return initializationError;
}

/** Firebase Auth — browser only (the Staff App is a client-side console). */
export function getFirebaseAuth(): Auth | null {
  if (!isBrowser()) return null;
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}

/** Firestore — browser only. */
export function getFirestoreDb(): Firestore | null {
  if (!isBrowser()) return null;
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}
