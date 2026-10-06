"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStaffApp } from "@/context/StaffAppContext";
import { StaffHeader } from "./StaffHeader";
import { SideMenu } from "./SideMenu";
import { BottomNavigation } from "./ui/BottomNavigation";
import { DesktopSidebar } from "./DesktopSidebar";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { LoadingState } from "./ui/LoadingState";

function getWorkspaceRoute(pathname: string | null): { slug: string; suffix: string } | null {
  if (!pathname || !pathname.startsWith("/staff/")) return null;
  const match = pathname.match(/^\/staff\/([^/]+)(\/.*)?$/);
  if (!match || match[1] === "login") return null;
  return { slug: decodeURIComponent(match[1]), suffix: match[2] || "" };
}

/**
 * Authenticated staff frame: header, side menu, bottom navigation and the
 * page slot. It never renders a screen until staffUsers/{uid} → clientId →
 * clients/{clientId} has resolved, so no page can invent a business.
 */
export function StaffShell({ children }: { children: React.ReactNode }) {
  const { status, isLoading, authorizationError, staffUser, clientId } = useStaffApp();
  const pathname = usePathname();
  const router = useRouter();
  const workspaceRoute = getWorkspaceRoute(pathname);

  useEffect(() => {
    if (!isLoading && !staffUser && workspaceRoute) {
      router.replace("/staff/login");
    }
  }, [isLoading, router, staffUser, workspaceRoute]);

  // Firebase Auth / staff registry still resolving — loading, never an error.
  if (isLoading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 pt-safe pb-safe">
        <LoadingState label="Checking staff session…" />
      </div>
    );
  }

  if (status === "error" || !staffUser || !clientId) {
    const detail =
      process.env.NODE_ENV === "production" ? null : (authorizationError?.technical ?? null);

    return (
      <div className="flex min-h-dvh items-center justify-center px-5 py-10 pt-safe pb-safe">
        <Card radius="2xl" className="w-full max-w-sm px-5 py-8 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-caramel-100 text-caramel-600">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-[1.05rem] font-extrabold text-espresso-900">
            Staff session unavailable
          </h1>
          <p className="mx-auto mt-2 max-w-[19rem] text-[0.8rem] font-medium leading-relaxed text-espresso-500">
            {authorizationError?.message || "Please sign in with your staff account."}
          </p>
          {detail && (
            <p className="mt-3 break-words rounded-md bg-cream-200 px-2.5 py-2 font-mono text-[0.6rem] leading-relaxed text-espresso-400">
              {detail}
            </p>
          )}
          <Button
            className="mt-5"
            size="lg"
            block
            onClick={() => router.replace("/staff/login")}
          >
            Go to Staff Login
          </Button>
        </Card>
      </div>
    );
  }

  // The URL slug is never a tenant selector: a mismatch is simply corrected.
  if (workspaceRoute && workspaceRoute.slug.toLowerCase() !== clientId.toLowerCase()) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 pt-safe pb-safe">
        <LoadingState label="Opening your assigned business…" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-transparent">
      <DesktopSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <StaffHeader />
        <main
          className={cn(
            "mx-auto w-full max-w-md flex-1 px-4 pt-4 md:max-w-2xl md:px-6 lg:max-w-3xl lg:px-8",
            // Clears the fixed bottom navigation + home indicator on mobile.
            "content-safe-bottom md:pb-8"
          )}
        >
          {children}
        </main>
      </div>

      <SideMenu />
      <BottomNavigation clientSlug={clientId} />
    </div>
  );
}
