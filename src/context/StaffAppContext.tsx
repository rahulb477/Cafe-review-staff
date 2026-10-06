"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { ClientConfig, StaffUser } from "@/services/types";
import { FirebaseService } from "@/services/firebaseService";
import { useRouter, usePathname } from "next/navigation";

interface StaffAppContextType {
  client: ClientConfig | null;
  staffUser: StaffUser | null;
  isLoading: boolean;
  authError: string | null;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchClient: (newSlug: string) => void;
  refreshClientData: () => Promise<void>;
  playChime: (type?: "stamp" | "reward" | "scan" | "error") => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
}

const StaffAppContext = createContext<StaffAppContextType | null>(null);

const DEFAULT_CLIENT_CONFIG: ClientConfig = {
  id: "bake",
  slug: "bake",
  name: "BAKE",
  tagline: "CAFÉ & BAKERY",
  logoText: "BAKE",
  stampTarget: 8,
  rewardName: "Free Coffee",
  rewardDescription: "Redeem any specialty beverage of your choice",
  primaryColor: "#3A1E0D",
  accentColor: "#D4A373",
  iconType: "coffee-bean",
};

export function StaffAppProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [client, setClient] = useState<ClientConfig | null>(DEFAULT_CLIENT_CONFIG);
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const router = useRouter();
  const pathname = usePathname();

  // Listen for Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = FirebaseService.listenToAuth(
      (authenticatedStaff, clientConfig) => {
        setStaffUser(authenticatedStaff);
        setClient(clientConfig);
        setIsLoading(false);
        setAuthError(null);

        // If currently on login page and successfully authenticated, redirect to staff dashboard
        if (pathname === "/staff/login" || pathname === "/" || pathname === "/staff") {
          router.push(`/staff/${authenticatedStaff.clientId}`);
        }
      },
      () => {
        // Not authenticated
        setStaffUser(null);
        setIsLoading(false);
      },
      (errorMsg) => {
        // Auth or staff validation error
        setStaffUser(null);
        setAuthError(errorMsg);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [pathname, router]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const res = await FirebaseService.login(email, password);
      if (res.success && res.staffUser) {
        setStaffUser(res.staffUser);
        const config = await FirebaseService.getClientConfig(res.staffUser.clientId);
        setClient(config);
        setIsLoading(false);
        router.push(`/staff/${res.staffUser.clientId}`);
        return { success: true };
      }
      setIsLoading(false);
      setAuthError(res.error || "Login failed");
      return { success: false, error: res.error || "Login failed" };
    } catch (e: any) {
      setIsLoading(false);
      const errMsg = e.message || "Network error occurred";
      setAuthError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  const logout = async () => {
    await FirebaseService.logout();
    setStaffUser(null);
    setIsDrawerOpen(false);
    router.push("/staff/login");
  };

  const switchClient = async (newSlug: string) => {
    setIsDrawerOpen(false);
    const config = await FirebaseService.getClientConfig(newSlug);
    setClient(config);
    router.push(`/staff/${newSlug}`);
  };

  const refreshClientData = async () => {
    if (staffUser?.clientId) {
      const config = await FirebaseService.getClientConfig(staffUser.clientId);
      setClient(config);
    }
  };

  const playChime = (type: "stamp" | "reward" | "scan" | "error" = "stamp") => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === "stamp") {
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === "reward") {
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        osc.frequency.setValueAtTime(783.99, now + 0.2);
        osc.frequency.setValueAtTime(1046.5, now + 0.3);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.start(now);
        osc.stop(now + 0.55);
      } else if (type === "scan") {
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else {
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch {
      // AudioContext policy
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
        switchClient,
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
