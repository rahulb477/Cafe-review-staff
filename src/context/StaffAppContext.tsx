"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FirebaseService } from "@/services/firebaseService";
import { ClientConfig, StaffUser } from "@/services/types";

interface StaffAppContextType {
  client: ClientConfig | null;
  staffUser: StaffUser | null;
  isLoading: boolean;
  authError: string | null;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
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
  const [client, setClient] = useState<ClientConfig | null>(null);
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = FirebaseService.listenToAuth(
      (authenticatedStaff, clientConfig) => {
        setStaffUser(authenticatedStaff);
        setClient(clientConfig);
        setIsLoading(false);
        setAuthError(null);

        const workspaceRoute = getWorkspaceRoute(pathname);
        if (pathname === "/staff/login" || pathname === "/" || pathname === "/staff") {
          router.replace(canonicalStaffRoute(authenticatedStaff.clientId));
        } else if (
          workspaceRoute &&
          workspaceRoute.slug.toLowerCase() !== authenticatedStaff.clientId.toLowerCase()
        ) {
          // The authenticated staff registry is authoritative. Preserve the
          // current screen, but move it under the assigned business route.
          router.replace(
            canonicalStaffRoute(authenticatedStaff.clientId, workspaceRoute.suffix)
          );
        }
      },
      () => {
        setStaffUser(null);
        setClient(null);
        setAuthError(null);
        setIsLoading(false);
        if (getWorkspaceRoute(pathname)) router.replace("/staff/login");
      },
      (errorMsg) => {
        setStaffUser(null);
        setClient(null);
        setAuthError(errorMsg);
        setIsLoading(false);
        if (getWorkspaceRoute(pathname)) router.replace("/staff/login");
      }
    );

    return () => unsubscribe();
  }, [pathname, router]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setAuthError(null);

    try {
      const result = await FirebaseService.login(email, password);
      if (!result.success || !result.staffUser) {
        const error = result.error || "Login failed.";
        setIsLoading(false);
        setAuthError(error);
        return { success: false, error };
      }

      const config = await FirebaseService.getClientConfig(result.staffUser.clientId);
      setStaffUser(result.staffUser);
      setClient(config);
      setIsLoading(false);
      router.replace(canonicalStaffRoute(result.staffUser.clientId));
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to sign in.";
      setIsLoading(false);
      setAuthError(message);
      return { success: false, error: message };
    }
  };

  const logout = async () => {
    await FirebaseService.logout();
    setStaffUser(null);
    setClient(null);
    setIsDrawerOpen(false);
    router.replace("/staff/login");
  };

  const refreshClientData = async () => {
    if (!staffUser?.clientId) return;
    const config = await FirebaseService.getClientConfig(staffUser.clientId);
    setClient(config);
  };

  const playChime = (type: "stamp" | "reward" | "scan" | "error" = "stamp") => {
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
  };

  return (
    <StaffAppContext.Provider
      value={{
        client,
        staffUser,
        isLoading,
        authError,
        isDrawerOpen,
        setIsDrawerOpen,
        login,
        logout,
        refreshClientData,
        playChime,
        soundEnabled,
        setSoundEnabled,
      }}
    >
      {children}
    </StaffAppContext.Provider>
  );
}

export function useStaffApp() {
  const context = useContext(StaffAppContext);
  if (!context) {
    throw new Error("useStaffApp must be used within StaffAppProvider");
  }
  return context;
}
