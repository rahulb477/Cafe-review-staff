"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStaffApp } from "@/context/StaffAppContext";
import { Home, QrCode, Users, Clock, Settings } from "lucide-react";

export function BottomNav() {
  const pathname = usePathname();
  const { client } = useStaffApp();
  const clientSlug = client?.slug || "bake";

  const tabs = [
    {
      label: "Home",
      href: `/staff/${clientSlug}`,
      icon: Home,
      exact: true,
    },
    {
      label: "Scan",
      href: `/staff/${clientSlug}/scan`,
      icon: QrCode,
      isSpecial: true,
    },
    {
      label: "Customers",
      href: `/staff/${clientSlug}/customers`,
      icon: Users,
    },
    {
      label: "Activity",
      href: `/staff/${clientSlug}/activity`,
      icon: Clock,
    },
    {
      label: "Settings",
      href: `/staff/${clientSlug}/settings`,
      icon: Settings,
    },
  ];

  return (
    <nav
      aria-label="Staff Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FDFBF7]/95 backdrop-blur-md border-t border-[#EBDCCF] px-2 py-1.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
    >
      <div className="max-w-md mx-auto flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname?.startsWith(tab.href);

          if (tab.isSpecial) {
            return (
              <Link
                key={tab.label}
                href={tab.href}
                className="relative -top-3 flex flex-col items-center group focus:outline-none"
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                    isActive
                      ? "bg-[#3A1E0D] text-[#E6B875] ring-4 ring-[#E6B875]/30"
                      : "bg-[#3A1E0D] text-white hover:bg-[#4A2810]"
                  }`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold text-[#3A1E0D] mt-0.5">
                  {tab.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition-all duration-150 ${
                isActive
                  ? "text-[#3A1E0D] font-bold scale-105"
                  : "text-stone-400 hover:text-stone-700"
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-transform ${
                  isActive ? "stroke-[2.5px]" : "stroke-[1.8px]"
                }`}
              />
              <span
                className={`text-[10px] mt-1 tracking-tight ${
                  isActive ? "font-bold text-[#3A1E0D]" : "font-medium"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
