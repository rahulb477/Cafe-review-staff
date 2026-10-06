"use client";

import React, { useState } from "react";
import { useStaffApp } from "@/context/StaffAppContext";
import { BakedLogoIcon } from "./Icons";
import { Bell, ChevronDown, CheckCircle2, Gift, Sparkles, X } from "lucide-react";
import Link from "next/link";

export function StaffHeader() {
  const { client, staffUser, setIsDrawerOpen } = useStaffApp();
  const [showNotifications, setShowNotifications] = useState(false);

  const clientName = client?.name || "BAKE";
  const clientTagline = client?.tagline || "CAFÉ & BAKERY";
  const staffName = staffUser?.name || "Amit";
  const staffRole = staffUser?.role || "Staff";

  const notifications = [
    { id: 1, title: "Kavya is ready for reward!", time: "10 mins ago", type: "reward", unread: true },
    { id: 2, title: "Rahul added 1 stamp", time: "25 mins ago", type: "stamp", unread: false },
    { id: 3, title: "Daily target 50% reached", time: "1 hour ago", type: "info", unread: false },
  ];

  return (
    <>
      <header className="sticky top-0 z-30 bg-[#FDFBF7]/95 backdrop-blur-md border-b border-[#EBDCCF]/60 px-4 py-3 flex items-center justify-between shadow-xs">
        {/* Brand / Logo */}
        <Link href={`/staff/${client?.slug || "bake"}`} className="flex items-center gap-2.5 group">
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

        {/* Right Controls: Notifications & Staff Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Notification Button */}
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-full text-[#4A2810] hover:bg-[#F3E7DC] transition-colors focus:outline-none focus:ring-2 focus:ring-[#B97B32]/30"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#E11D48] rounded-full ring-2 ring-white animate-pulse" />
          </button>

          {/* Staff Pill Avatar Trigger (Screen 2 / Screen 12) */}
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

      {/* Notification Dropdown Popover */}
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
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`p-2.5 rounded-xl text-xs flex items-start gap-2.5 transition-colors ${
                  n.unread ? "bg-[#FFF8F0] border border-[#F5DEC7]" : "bg-stone-50"
                }`}
              >
                {n.type === "reward" ? (
                  <Gift className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : n.type === "stamp" ? (
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-medium text-stone-800 leading-tight">{n.title}</p>
                  <p className="text-[10px] text-stone-400 mt-0.5">{n.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
