"use client";

import React from "react";
import { StaffHeader } from "./StaffHeader";
import { StaffDrawer } from "./StaffDrawer";
import { BottomNav } from "./BottomNav";
import { DesktopSidebar } from "./DesktopSidebar";
import { useStaffApp } from "@/context/StaffAppContext";

export function StaffShell({ children }: { children: React.ReactNode }) {
  const { isLoading } = useStaffApp();

  return (
    <div className="min-h-screen bg-[#F8F4EC] text-[#2D1808] flex">
      {/* Desktop Navigation */}
      <DesktopSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-6">
        <StaffHeader />
        <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Mobile Drawer & Bottom Navigation */}
      <StaffDrawer />
      <BottomNav />
    </div>
  );
}
