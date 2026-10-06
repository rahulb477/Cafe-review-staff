import { FirebaseApp, FirebaseOptions, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const requiredConfigKeys: Array<keyof FirebaseOptions> = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

const missingConfigKeys = requiredConfigKeys.filter((key) => {
  const value = firebaseConfig[key];
  return typeof value !== "string" || value.trim().length === 0;
});

/**
 * Firebase configuration is intentionally not replaced with defaults. A Vercel
 * build can still complete without these public variables, but the app reports
 * this diagnostic instead of connecting to an invalid Firebase project.
 */
export const firebaseConfigError =
  missingConfigKeys.length > 0
    ? `Firebase is not configured. Set: ${missingConfigKeys
        .map((key) => `NEXT_PUBLIC_FIREBASE_${key === "apiKey" ? "API_KEY" : key === "authDomain" ? "AUTH_DOMAIN" : key === "projectId" ? "PROJECT_ID" : key === "storageBucket" ? "STORAGE_BUCKET" : key === "messagingSenderId" ? "MESSAGING_SENDER_ID" : "APP_ID"}`)
        .join(", ")}.`
    : null;

const canInitializeFirebase = !firebaseConfigError && typeof window !== "undefined";

let app: FirebaseApp | null = null;
if (canInitializeFirebase) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

/**
 * These remain nullable so server rendering and a build without Vercel
 * Firebase variables are safe. Firebase is initialized once in the browser
 * through getApps()/getApp().
 */
export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;

export { app, firebaseConfig };
