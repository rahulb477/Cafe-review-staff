"use client";

import React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full-width block button (the reference's primary CTAs). */
  block?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-espresso-800 text-cream-50 shadow-card hover:bg-espresso-700 active:bg-espresso-900 " +
    "disabled:bg-espresso-800/60 disabled:shadow-none",
  secondary:
    "bg-cream-100 text-espresso-800 border border-line hover:bg-sand-100 active:bg-sand-200",
  ghost:
    "bg-transparent text-espresso-600 hover:bg-sand-100 active:bg-sand-200",
  danger:
    "bg-alert-50 text-alert-700 border border-alert-100 hover:bg-alert-100 active:bg-alert-100",
  success:
    "bg-leaf-600 text-cream-50 shadow-card hover:bg-leaf-700 active:bg-leaf-700",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-xs rounded-md gap-1.5",
  md: "h-11 px-4 text-sm rounded-lg gap-2",
  lg: "h-[3.4rem] px-5 text-[0.95rem] rounded-xl gap-2",
};

/**
 * The single button used across every Staff screen, so height, radius,
 * weight and the espresso-brown primary action stay identical everywhere.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    block = false,
    loading = false,
    loadingLabel,
    iconLeft,
    iconRight,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        "press-scale inline-flex items-center justify-center font-semibold",
        "select-none cursor-pointer whitespace-nowrap",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso-800",
        "disabled:cursor-not-allowed disabled:opacity-70 disabled:active:transform-none",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        iconLeft && <span className="shrink-0 [&>svg]:size-[1.15rem]">{iconLeft}</span>
      )}
      <span className="truncate">{loading ? (loadingLabel ?? children) : children}</span>
      {!loading && iconRight && (
        <span className="shrink-0 [&>svg]:size-[1.15rem]">{iconRight}</span>
      )}
    </button>
  );
});

export interface LinkButtonProps
  extends Omit<React.ComponentProps<typeof Link>, "className" | "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Client-side link that is pixel-identical to <Button>. Uses next/link so a
 * navigation never reloads the app (and never tears down the Firebase session).
 */
export const LinkButton = React.forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  {
    variant = "primary",
    size = "md",
    block = false,
    iconLeft,
    iconRight,
    className,
    children,
    ...rest
  },
  ref
) {
  return (
    <Link
      ref={ref}
      className={cn(
        "press-scale inline-flex items-center justify-center font-semibold",
        "select-none cursor-pointer whitespace-nowrap no-underline",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso-800",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className
      )}
      {...rest}
    >
      {iconLeft && <span className="shrink-0 [&>svg]:size-[1.15rem]">{iconLeft}</span>}
      <span className="truncate">{children}</span>
      {iconRight && <span className="shrink-0 [&>svg]:size-[1.15rem]">{iconRight}</span>}
    </Link>
  );
});
