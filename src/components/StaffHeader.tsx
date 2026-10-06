"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useStaffApp } from "@/context/StaffAppContext";
import { BakedLogoIcon } from "./Icons";
import { Bell, ChevronDown, X } from "lucide-react";

export function StaffHeader() {
  const { client, staffUser, setIsDrawerOpen } = useStaffApp();
  const [showNotifications, setShowNotifications] = useState(false);

  const clientSlug = staffUser?.clientId || client?.slug || "";
  const clientName = client?.name || "Staff Portal";
  const clientTagline = client?.tagline || "FIREBASE STAFF CONSOLE";
  const staffName = staffUser?.name || "Staff Member";
  const staffRole = staffUser?.role || "Staff Member";

  return (
    <>
      <header className="sticky top-0 z-30 bg-[#FDFBF7]/95 backdrop-blur-md border-b border-[#EBDCCF]/60 px-4 py-3 flex items-center justify-between shadow-xs">
        <Link href={`/staff/${clientSlug}`} className="flex items-center gap-2.5 group">
          <BakedLogoIcon className="w-8 h-8 group-hover:scale-105 transition-transform" />
          <div className="flex flex-col">
            <span className="font-extrabold text-sm tracking-wide text-[#3A1E0D] leading-tight">
              {clientName}
            </span>
            <span className="text-[9px] font-semibold tracking-wider text-[#A0704C] uppercase">
              {clientTagline}
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-full text-[#4A2810] hover:bg-[#F3E7DC] transition-colors focus:outline-none focus:ring-2 focus:ring-[#B97B32]/30"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
          </button>

          <button
            onClick={() => setIsDrawerOpen(true)}
            className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full bg-[#F5EBE0] hover:bg-[#ECD8C8] border border-[#DFC8B4] transition-all group focus:outline-none focus:ring-2 focus:ring-[#B97B32]/30"
            aria-label="Open staff menu"
          >
            <div className="w-7 h-7 rounded-full bg-[#3A1E0D] text-[#FDFBF7] font-bold text-xs flex items-center justify-center shadow-xs">
              {staffName.charAt(0)}
            </div>
            <div className="hidden xs:flex flex-col text-left">
              <span className="text-xs font-semibold text-[#3A1E0D] leading-none flex items-center gap-0.5">
                {staffName}
                <ChevronDown className="w-3 h-3 text-[#8C5D3B] group-hover:translate-y-0.5 transition-transform" />
              </span>
              <span className="text-[9px] text-[#8C5D3B] font-medium leading-none mt-0.5">
                {staffRole}
              </span>
            </div>
          </button>
        </div>
      </header>

      {showNotifications && (
        <div
          role="region"
          aria-label="Notifications Panel"
          className="fixed top-14 right-4 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-[#EBDCCF] p-3 animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-100">
            <span className="text-xs font-bold text-[#3A1E0D]">Staff Notifications</span>
            <button
              onClick={() => setShowNotifications(false)}
              className="text-stone-400 hover:text-stone-600 p-1"
              aria-label="Close notifications"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="px-2 py-4 text-center text-xs text-stone-400">
            No new notifications.
          </p>
        </div>
      )}
    </>
  );
}
