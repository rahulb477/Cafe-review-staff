"use client";

import React from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Slightly recessed beige surface instead of white/cream. */
  tone?: "cream" | "sand" | "espresso" | "plain";
  /** Removes the default padding so callers control the internal rhythm. */
  flush?: boolean;
  interactive?: boolean;
  radius?: "md" | "lg" | "xl" | "2xl";
}

const TONES: Record<NonNullable<CardProps["tone"]>, string> = {
  cream: "bg-cream-50 border-line shadow-card",
  sand: "bg-cream-200/70 border-line-soft shadow-hairline",
  espresso: "bg-espresso-800 border-espresso-900 text-cream-100 shadow-raise",
  plain: "bg-transparent border-transparent shadow-none",
};

const RADII: Record<NonNullable<CardProps["radius"]>, string> = {
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
};

/**
 * The one card surface. Every panel in the app — stats, quick actions,
 * loyalty, customer, reward, activity — is a <Card>, which is what keeps
 * radius, border and elevation identical across screens.
 */
export function Card({
  tone = "cream",
  flush = false,
  interactive = false,
  radius = "xl",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "border min-w-0",
        TONES[tone],
        RADII[radius],
        !flush && "p-4",
        interactive && "press-scale cursor-pointer hover:border-espresso-200 hover:shadow-raise",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardBody({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0", className)} {...rest} />;
}

/** Small uppercase eyebrow used to label a section of the screen. */
export function SectionHeading({
  title,
  action,
  className,
  id,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3 px-0.5", className)}>
      <h2
        id={id}
        className="text-[0.7rem] font-bold uppercase tracking-[0.09em] text-espresso-400"
      >
        {title}
      </h2>
      {action}
    </div>
  );
}
