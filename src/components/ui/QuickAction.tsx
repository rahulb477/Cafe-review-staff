"use client";

import React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "./Card";

export interface QuickActionProps {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Navigating action. */
  href?: string;
  /** In-page action (mutually exclusive with href). */
  onClick?: () => void;
  /** Emphasised action uses the espresso icon tile. */
  accent?: boolean;
  trailing?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

const rowClasses =
  "flex w-full items-center gap-3.5 p-3.5 sm:p-4 text-left press-scale";

function Inner({
  icon: Icon,
  title,
  description,
  accent,
  trailing,
  disabled,
}: Required<Pick<QuickActionProps, "icon" | "title" | "description">> & {
  accent?: boolean;
  trailing?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <>
      <span
        className={cn(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition-transform",
          accent
            ? "bg-espresso-800 text-caramel-300 shadow-[0_6px_14px_-8px_rgba(58,30,13,0.9)]"
            : "bg-sand-100 text-espresso-700"
        )}
        aria-hidden="true"
      >
        <Icon className="size-[1.25rem]" strokeWidth={2} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.88rem] font-bold text-espresso-900">
          {title}
        </span>
        <span className="mt-0.5 block text-[0.74rem] font-medium leading-snug text-espresso-400">
          {description}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        {trailing}
        <ChevronRight
          className={cn(
            "size-4.5 transition-transform",
            disabled ? "text-espresso-200" : "text-espresso-300"
          )}
          aria-hidden="true"
        />
      </span>
    </>
  );
}

/**
 * Premium interactive list row used by the dashboard Quick Actions.
 * Identical whether it navigates (Link) or acts in place (button).
 */
export function QuickAction({
  title,
  description,
  icon,
  href,
  onClick,
  accent = false,
  trailing,
  disabled = false,
  className,
}: QuickActionProps) {
  const shared = cn(
    "hover:border-espresso-200 hover:shadow-raise",
    disabled && "pointer-events-none opacity-60",
    className
  );

  if (href) {
    return (
      <Card radius="xl" flush className={shared}>
        <Link href={href} className={rowClasses}>
          <Inner
            icon={icon}
            title={title}
            description={description}
            accent={accent}
            trailing={trailing}
            disabled={disabled}
          />
        </Link>
      </Card>
    );
  }

  return (
    <Card radius="xl" flush className={shared}>
      <button type="button" onClick={onClick} disabled={disabled} className={cn(rowClasses, "cursor-pointer")}>
        <Inner
          icon={icon}
          title={title}
          description={description}
          accent={accent}
          trailing={trailing}
          disabled={disabled}
        />
      </button>
    </Card>
  );
}
