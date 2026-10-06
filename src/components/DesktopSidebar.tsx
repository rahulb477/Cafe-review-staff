"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStaffApp } from "@/context/StaffAppContext";
import { BakedLogoIcon } from "./Icons";
import {
  ChevronRight,
  Clock,
  Gift,
  Home,
  LogOut,
  QrCode,
  Settings,
  Users,
} from "lucide-react";

export function DesktopSidebar() {
  const pathname = usePathname();
  const { client, staffUser, logout } = useStaffApp();
  const clientSlug = staffUser?.clientId || client?.slug || "";

  const navItems = [
    { label: "Dashboard", href: `/staff/${clientSlug}`, icon: Home, exact: true },
    { label: "Scan QR", href: `/staff/${clientSlug}/scan`, icon: QrCode },
    { label: "Customers", href: `/staff/${clientSlug}/customers`, icon: Users },
    { label: "Activity", href: `/staff/${clientSlug}/activity`, icon: Clock },
    { label: "Rewards", href: `/staff/${clientSlug}/rewards`, icon: Gift },
    { label: "Settings", href: `/staff/${clientSlug}/settings`, icon: Settings },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 lg:w-72 bg-[#FDFBF7] border-r border-[#EBDCCF] h-screen sticky top-0 shrink-0 select-none shadow-xs">
      <div className="p-5 border-b border-[#EBDCCF] flex items-center gap-3 bg-[#3A1E0D] text-white">
        <BakedLogoIcon className="w-10 h-10 ring-2 ring-[#E6B875]/40" />
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-base tracking-wide text-white truncate">
            {client?.name || "Staff Portal"}
          </div>
          <div className="text-[10px] font-semibold tracking-wider text-[#D4A373] uppercase truncate">
            {client?.tagline || "FIREBASE STAFF CONSOLE"}
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-[#EBDCCF]/60 bg-[#FAF4ED] flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#3A1E0D] text-[#E6B875] font-bold text-sm flex items-center justify-center shadow-xs">
          {(staffUser?.name || "S").charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-[#3A1E0D] leading-tight truncate">
            {staffUser?.name || "Staff Member"}
          </p>
          <p className="text-xs text-stone-500 font-medium">
            {staffUser?.role || "Staff Member"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
        <div className="px-3 py-1 text-[11px] font-bold text-stone-400 uppercase tracking-wider">
          Staff Console
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isActive
                  ? "bg-[#3A1E0D] text-white shadow-md shadow-[#3A1E0D]/10"
                  : "text-stone-700 hover:bg-[#F3E7DC] hover:text-[#3A1E0D]"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-5 h-5 ${isActive ? "text-[#E6B875]" : "text-stone-500"}`}
                />
                <span>{item.label}</span>
              </div>
              {isActive && <ChevronRight className="w-4 h-4 text-[#E6B875]" />}
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-[#EBDCCF] bg-[#FAF4ED]">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold text-xs transition-colors border border-red-200"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out Staff Session</span>
        </button>
      </div>
    </aside>
  );
}
