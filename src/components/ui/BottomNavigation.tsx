"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Home, QrCode, Settings, Users } from "lucide-react";
import { cn } from "@/lib/cn";

export interface BottomNavigationProps {
  clientSlug: string;
  className?: string;
}

/**
 * Compact fixed bottom navigation (Home · Scan · Customers · Activity ·
 * Settings). Active item is espresso brown, inactive items a muted neutral.
 * Respects env(safe-area-inset-bottom) so it never sits under the home bar.
 */
export function BottomNavigation({ clientSlug, className }: BottomNavigationProps) {
  const pathname = usePathname();

  const tabs = [
    { label: "Home", href: `/staff/${clientSlug}`, icon: Home, exact: true },
    { label: "Scan", href: `/staff/${clientSlug}/scan`, icon: QrCode },
    { label: "Customers", href: `/staff/${clientSlug}/customers`, icon: Users },
    { label: "Activity", href: `/staff/${clientSlug}/activity`, icon: Clock },
    { label: "Settings", href: `/staff/${clientSlug}/settings`, icon: Settings },
  ];

  return (
    <nav
      aria-label="Staff navigation"
      className={cn(
        "md:hidden fixed inset-x-0 bottom-0 z-40",
        "border-t border-line bg-cream-100/97 backdrop-blur-md",
        "shadow-nav nav-safe-bottom",
        className
      )}
      style={{ ["--staff-nav-height" as string]: "4rem" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1">
        {tabs.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || Boolean(pathname?.startsWith(`${tab.href}/`));
          const Icon = tab.icon;

          return (
            <li key={tab.label} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "press-scale flex h-16 flex-col items-center justify-center gap-1 rounded-lg px-1",
                  isActive ? "text-espresso-800" : "text-espresso-300 hover:text-espresso-500"
                )}
              >
                <Icon
                  className="size-[1.3rem]"
                  strokeWidth={isActive ? 2.4 : 1.9}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "text-[0.62rem] leading-none tracking-tight",
                    isActive ? "font-bold" : "font-medium"
                  )}
                >
                  {tab.label}
                </span>
                <span
                  className={cn(
                    "mt-0.5 h-1 w-1 rounded-full transition-colors",
                    isActive ? "bg-caramel-500" : "bg-transparent"
                  )}
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
