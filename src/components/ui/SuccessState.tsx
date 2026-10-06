"use client";

import React from "react";
import { cn } from "@/lib/cn";

export interface SuccessStateProps {
  /** Illustration / icon shown above the heading. */
  graphic?: React.ReactNode;
  title: string;
  /** Supporting line, may contain rich markup (bold counts). */
  message?: React.ReactNode;
  children?: React.ReactNode;
  /** Stacked primary + secondary CTAs. */
  actions?: React.ReactNode;
  tone?: "cream" | "plain";
  className?: string;
}

/**
 * Full-screen celebratory result state — Stamp Added (screen 6) and Reward
 * Unlocked (screen 7) share it so both feel like the same moment.
 */
export function SuccessState({
  graphic,
  title,
  message,
  children,
  actions,
  tone = "plain",
  className,
}: SuccessStateProps) {
  return (
    <div className={cn("mx-auto flex w-full max-w-md flex-col", className)}>
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-6 text-center">
        {graphic && (
          <div className="animate-pop relative mb-5 flex justify-center">{graphic}</div>
        )}

        <h2 className="text-[1.6rem] font-extrabold leading-tight tracking-tight text-espresso-900">
          {title}
        </h2>

        {message && (
          <p className="mt-2 max-w-[20rem] text-[0.86rem] font-medium leading-relaxed text-espresso-500">
            {message}
          </p>
        )}

        {children && (
          <div
            className={cn(
              "mt-6 w-full",
              tone === "cream" && "rounded-xl border border-line bg-cream-50 p-4 shadow-card"
            )}
          >
            {children}
          </div>
        )}
      </div>

      {actions && <div className="space-y-2.5 px-1 pt-2">{actions}</div>}
    </div>
  );
}
