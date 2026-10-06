"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { FirebaseService, type StaffAuthEvent } from "@/services/firebaseService";
import {
  describeErrorForDiagnostics,
  StaffServiceError,
  toStaffServiceError,
  type StaffErrorCode,
} from "@/services/staffErrors";
import {
  ClientConfig,
  StaffSession,
  StaffUser,
} from "@/services/types";

/**
 * ONE canonical Staff session context.
 *
 * Authorization state machine (no screen derives its own clientId):
 *
 *   initializing  → Firebase Auth is still resolving (loading UI, never an error)
 *   signed-out    → no authenticated user
 *   authorizing   → authenticated; staffUsers/{uid} + clients/{clientId} loading
 *   authorized    → staffRecord + clientRecord + clientId resolved
 *   error         → authorization failed with a precise, mapped message
 */

export type StaffSessionStatus =
  | "initializing"
  | "signed-out"
  | "authorizing"
  | "authorized"
  | "error";

export interface StaffAuthorizationError {
  code: StaffErrorCode;
  message: string;
  technical: string;
}

interface StaffAppContextType {
  /* Canonical session */
  status: StaffSessionStatus;
  session: StaffSession | null;
  firebaseUser: StaffSession["firebaseUser"] | null;
  uid: string | null;
  staffRecord: StaffUser | null;
  clientId: string | null;
  clientRecord: ClientConfig | null;
  loading: boolean;
  authorizationError: StaffAuthorizationError | null;

  /* Aliases consumed by the existing screens (unchanged UI) */
  client: ClientConfig | null;
  staffUser: StaffUser | null;
  isLoading: boolean;
  authError: string | null;

  /* Navigation chrome */
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;

  login: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string; code?: StaffErrorCode }>;
  logout: () => Promise<void>;
  refreshClientData: () => Promise<void>;
  playChime: (type?: "stamp" | "reward" | "scan" | "error") => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
}

const StaffAppContext = createContext<StaffAppContextType | null>(null);

function getWorkspaceRoute(pathname: string | null): { slug: string; suffix: string } | null {
  if (!pathname || !pathname.startsWith("/staff/")) return null;
  const match = pathname.match(/^\/staff\/([^/]+)(\/.*)?$/);
  if (!match || match[1] === "login") return null;
  return { slug: decodeURIComponent(match[1]), suffix: match[2] || "" };
}

function canonicalStaffRoute(clientId: string, suffix = ""): string {
  return `/staff/${encodeURIComponent(clientId)}${suffix}`;
}

export function StaffAppProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<StaffSessionStatus>("initializing");
  const [session, setSession] = useState<StaffSession | null>(null);
  const [authorizationError, setAuthorizationError] = useState<StaffAuthorizationError | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const router = useRouter();
  const pathname = usePathname();

  const staffUser = session?.staffRecord ?? null;
  const client = session?.clientRecord ?? null;
  const clientId = session?.clientId ?? null;
  const isLoading = status === "initializing" || status === "authorizing";

  /* ------------------------------------------------------------------ *
   * Firebase Auth subscription (mounted once — no per-navigation churn)
   * ------------------------------------------------------------------ */
  useEffect(() => {
    let mounted = true;

    const unsubscribe = FirebaseService.observeAuthState((event: StaffAuthEvent) => {
      if (!mounted) return;

      switch (event.status) {
        case "initializing":
          setStatus("initializing");
          setSession(null);
          setAuthorizationError(null);
          break;
        case "signed-out":
          setStatus("signed-out");
          setSession(null);
          setAuthorizationError(null);
          break;
        case "authorizing":
          // Authentication resolved but the staff registry is still loading:
          // keep the loading state; never show "account not found" yet.
          setStatus("authorizing");
          setSession(null);
          setAuthorizationError(null);
          break;
        case "authorized":
          setStatus("authorized");
          setSession(event.session);
          setAuthorizationError(null);
          break;
        case "error":
          setStatus("error");
          setSession(null);
          setAuthorizationError({
            code: event.error.staffCode,
            message: event.error.message,
            technical: describeErrorForDiagnostics(event.error),
          });
          break;
        default:
          break;
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  /* ------------------------------------------------------------------ *
   * Route canonicalization — the assigned business is authoritative.
   * The URL never selects a tenant; a mismatching slug is simply replaced.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    const currentPath = pathname;

    if (status === "authorized" && clientId) {
      if (currentPath === "/staff/login" || currentPath === "/staff" || currentPath === "/") {
        router.replace(canonicalStaffRoute(clientId));
        return;
      }
      const workspaceRoute = getWorkspaceRoute(currentPath);
      if (workspaceRoute && workspaceRoute.slug.toLowerCase() !== clientId.toLowerCase()) {
        router.replace(canonicalStaffRoute(clientId, workspaceRoute.suffix));
      }
      return;
    }

    if (status === "signed-out" || status === "error") {
      if (getWorkspaceRoute(currentPath)) router.replace("/staff/login");
    }
  }, [status, clientId, pathname, router]);

  /* ------------------------------------------------------------------ *
   * Login / logout
   * ------------------------------------------------------------------ */
  const login = useCallback(
    async (email: string, password: string) => {
      setStatus("authorizing");
      setAuthorizationError(null);

      const result = await FirebaseService.login(email, password);

      if (result.ok) {
        setSession(result.session);
        setStatus("authorized");
        setAuthorizationError(null);
        router.replace(canonicalStaffRoute(result.session.clientId));
        return { success: true };
      }

      setSession(null);
      setStatus("error");
      setAuthorizationError({
        code: result.error.staffCode,
        message: result.error.message,
        technical: describeErrorForDiagnostics(result.error),
      });
      return { success: false, error: result.error.message, code: result.error.staffCode };
    },
    [router]
  );

  const logout = useCallback(async () => {
    await FirebaseService.logout();
    setSession(null);
    setAuthorizationError(null);
    setStatus("signed-out");
    setIsDrawerOpen(false);
    router.replace("/staff/login");
  }, [router]);

  const refreshClientData = useCallback(async () => {
    if (!session?.clientId) return;
    try {
      const clientRecord = await FirebaseService.refreshClientConfig();
      setSession((current) => (current ? { ...current, clientRecord } : current));
    } catch (error: unknown) {
      const staffErr: StaffServiceError = toStaffServiceError(error);
      console.warn("[staff-context] refresh client notice:", describeErrorForDiagnostics(staffErr));
      setAuthorizationError({
        code: staffErr.staffCode,
        message: staffErr.message,
        technical: describeErrorForDiagnostics(staffErr),
      });
      throw staffErr;
    }
  }, [session?.clientId]);

  const playChime = useCallback(
    (type: "stamp" | "reward" | "scan" | "error" = "stamp") => {
      if (!soundEnabled || typeof window === "undefined") return;

      try {
        const AudioContextConstructor =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioContextConstructor) return;

        const audioContext = new AudioContextConstructor();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        const now = audioContext.currentTime;
        if (type === "stamp") {
          oscillator.frequency.setValueAtTime(587.33, now);
          oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.15);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          oscillator.start(now);
          oscillator.stop(now + 0.3);
        } else if (type === "reward") {
          oscillator.frequency.setValueAtTime(523.25, now);
          oscillator.frequency.setValueAtTime(659.25, now + 0.1);
          oscillator.frequency.setValueAtTime(783.99, now + 0.2);
          oscillator.frequency.setValueAtTime(1046.5, now + 0.3);
          gain.gain.setValueAtTime(0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
          oscillator.start(now);
          oscillator.stop(now + 0.55);
        } else if (type === "scan") {
          oscillator.frequency.setValueAtTime(800, now);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          oscillator.start(now);
          oscillator.stop(now + 0.08);
        } else {
          oscillator.frequency.setValueAtTime(220, now);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          oscillator.start(now);
          oscillator.stop(now + 0.25);
        }
      } catch {
        // Browsers can reject AudioContext until a user gesture.
      }
    },
    [soundEnabled]
  );

  const value = useMemo<StaffAppContextType>(
    () => ({
      status,
      session,
      firebaseUser: session?.firebaseUser ?? null,
      uid: session?.uid ?? null,
      staffRecord: staffUser,
      clientId,
      clientRecord: client,
      loading: isLoading,
      authorizationError,
      client,
      staffUser,
      isLoading,
      authError: authorizationError?.message ?? null,
      isDrawerOpen,
      setIsDrawerOpen,
      login,
      logout,
      refreshClientData,
      playChime,
      soundEnabled,
      setSoundEnabled,
    }),
    [
      status,
      session,
      staffUser,
      client,
      clientId,
      isLoading,
      authorizationError,
      isDrawerOpen,
      login,
      logout,
      refreshClientData,
      playChime,
      soundEnabled,
    ]
  );

  return <StaffAppContext.Provider value={value}>{children}</StaffAppContext.Provider>;
}

export function useStaffApp() {
  const context = useContext(StaffAppContext);
  if (!context) {
    throw new Error("useStaffApp must be used within StaffAppProvider");
  }
  return context;
}

/** Convenience hook: the canonical clientId of the authenticated staff member. */
export function useStaffClientId(): string | null {
  return useStaffApp().clientId;
}
