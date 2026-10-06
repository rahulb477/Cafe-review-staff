"use client";

import React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Back destination; omit to render a non-navigating spacer. */
  backHref?: string;
  onBack?: () => void;
  /** Replaces the back chevron with a button (e.g. in-flow success screens). */
  backAsButton?: boolean;
  right?: React.ReactNode;
  className?: string;
}

/**
 * Shared sub-screen header: circular back affordance, centred title and an
 * optional right slot. Identical height/radius on Scan, Customer Details,
 * Customer Lookup, Recent Activity, Rewards and Settings.
 */
export function ScreenHeader({
  title,
  subtitle,
  backHref,
  onBack,
  backAsButton = false,
  right,
  className,
}: ScreenHeaderProps) {
  const backButton = (
    <>
      <ChevronLeft className="size-5" aria-hidden="true" />
      <span className="sr-only">Back</span>
    </>
  );

  return (
    <header
      className={cn(
        "flex items-center justify-between gap-2 pt-1 pb-1",
        className
      )}
    >
      {backAsButton || !backHref ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className={cn(
            "press-scale size-10 shrink-0 rounded-full border border-line bg-cream-50",
            "flex items-center justify-center text-espresso-800 shadow-hairline",
            "hover:bg-sand-100 active:bg-sand-200",
            !onBack && !backAsButton && "pointer-events-none invisible"
          )}
        >
          {backButton}
        </button>
      ) : (
        <Link
          href={backHref}
          onClick={onBack}
          aria-label="Back"
          className={cn(
            "press-scale size-10 shrink-0 rounded-full border border-line bg-cream-50",
            "flex items-center justify-center text-espresso-800 shadow-hairline",
            "hover:bg-sand-100 active:bg-sand-200"
          )}
        >
          {backButton}
        </Link>
      )}

      <div className="min-w-0 flex-1 text-center">
        <h1 className="truncate text-[0.98rem] font-bold leading-tight text-espresso-900">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 truncate text-[0.7rem] font-medium text-espresso-400">
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex size-10 shrink-0 items-center justify-end">
        {right ?? <span aria-hidden="true" />}
      </div>
    </header>
  );
}
