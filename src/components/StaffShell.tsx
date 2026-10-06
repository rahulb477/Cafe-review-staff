"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { StaffHeader } from "./StaffHeader";
import { StaffDrawer } from "./StaffDrawer";
import { BottomNav } from "./BottomNav";
import { DesktopSidebar } from "./DesktopSidebar";
import { useStaffApp } from "@/context/StaffAppContext";

function getWorkspaceRoute(pathname: string | null): { slug: string; suffix: string } | null {
  if (!pathname || !pathname.startsWith("/staff/")) return null;
  const match = pathname.match(/^\/staff\/([^/]+)(\/.*)?$/);
  if (!match || match[1] === "login") return null;
  return { slug: decodeURIComponent(match[1]), suffix: match[2] || "" };
}

export function StaffShell({ children }: { children: React.ReactNode }) {
  const { isLoading, authError, staffUser } = useStaffApp();
  const pathname = usePathname();
  const router = useRouter();
  const workspaceRoute = getWorkspaceRoute(pathname);

  useEffect(() => {
    if (!isLoading && !staffUser && workspaceRoute) {
      router.replace("/staff/login");
    }
  }, [isLoading, router, staffUser, workspaceRoute]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F4EC] flex items-center justify-center text-sm text-[#3A1E0D]">
        Checking Firebase staff session...
      </div>
    );
  }

  if (authError || !staffUser) {
    return (
      <div className="min-h-screen bg-[#F8F4EC] flex items-center justify-center p-6 text-center">
        <div className="max-w-md rounded-3xl bg-white border border-[#EBDCCF] p-6 shadow-xs">
          <h1 className="text-lg font-bold text-[#3A1E0D]">Staff session unavailable</h1>
          <p className="mt-2 text-sm text-stone-600">
            {authError || "Please sign in with your Firebase staff account."}
          </p>
          <button
            type="button"
            onClick={() => router.replace("/staff/login")}
            className="mt-5 rounded-xl bg-[#3A1E0D] px-4 py-2.5 text-sm font-bold text-white"
          >
            Go to Staff Login
          </button>
        </div>
      </div>
    );
  }

  if (
    workspaceRoute &&
    workspaceRoute.slug.toLowerCase() !== staffUser.clientId.toLowerCase()
  ) {
    return (
      <div className="min-h-screen bg-[#F8F4EC] flex items-center justify-center text-sm text-[#3A1E0D]">
        Opening your assigned business...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F4EC] text-[#2D1808] flex">
      <DesktopSidebar />
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-6">
        <StaffHeader />
        <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
      <StaffDrawer />
      <BottomNav />
    </div>
  );
}
