import React from "react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ *
 * Brand mark
 *
 * The business identity always comes from clients/{clientId}:
 *   logo / logoUrl → image, otherwise logoText / name → warm monogram.
 * Nothing here is hardcoded to a specific café.
 * ------------------------------------------------------------------ */

export interface CafeLogoProps {
  name?: string;
  logoUrl?: string | null;
  logoText?: string;
  className?: string;
  /** Light treatment for dark headers/sidebars. */
  inverse?: boolean;
}

function looksLikeImageUrl(value?: string | null): value is string {
  if (!value) return false;
  return /^(https?:|data:image\/|\/)/i.test(value.trim());
}

export function CafeLogo({
  name,
  logoUrl,
  logoText,
  className,
  inverse = false,
}: CafeLogoProps) {
  const label = (logoText || name || "S").trim();
  const monogram = label.charAt(0).toUpperCase();

  if (looksLikeImageUrl(logoUrl)) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
          "bg-cream-100 ring-1 ring-line",
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name ? `${name} logo` : "Business logo"} className="size-full object-cover" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "font-extrabold tracking-tight no-select",
        inverse
          ? "bg-caramel-400/20 text-caramel-300 ring-1 ring-caramel-300/40"
          : "bg-espresso-800 text-caramel-300 shadow-hairline",
        className
      )}
      aria-hidden={!name}
      role={name ? "img" : undefined}
      aria-label={name ? `${name} logo` : undefined}
    >
      <svg viewBox="0 0 32 32" className="size-[62%]" aria-hidden="true">
        <ellipse cx="16" cy="16" rx="8" ry="10.5" fill="#D4A373" />
        <path d="M16 6.2c-2.1 3.4-2.1 16.2 0 19.6 2.1-3.4 2.1-16.2 0-19.6Z" fill="#3A1E0D" />
      </svg>
      <span className="sr-only">{monogram}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Illustrations (inline SVG — no binary assets, no external requests)
 * ------------------------------------------------------------------ */

/** Warm coffee cup used by Confirm Stamp, Stamp Added and Reward cards. */
export function CoffeeCupIllustration({ className = "size-24" }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex items-center justify-center", className)}>
      <span
        className="absolute inset-[12%] rounded-full bg-caramel-300/25 blur-xl"
        aria-hidden="true"
      />
      <svg viewBox="0 0 100 100" className="relative size-full" aria-hidden="true">
        <path
          d="M42 24c-2-4 1-8-1-12"
          stroke="#D4A373"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.75"
        />
        <path
          d="M50 22c-2-4 2-8-1-12"
          stroke="#D4A373"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />
        <path
          d="M58 25c-2-4 1-8-1-12"
          stroke="#D4A373"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.75"
        />

        <ellipse cx="50" cy="80" rx="34" ry="7" fill="#EFE3D3" />
        <ellipse cx="50" cy="78" rx="26" ry="4.5" fill="#E1D2BF" />

        <path
          d="M68 44c10 0 12 15-1 17"
          fill="none"
          stroke="#3A1E0D"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path d="M27 38c0 0 2 30 23 30s23-30 23-30H27Z" fill="#3A1E0D" />
        <ellipse cx="50" cy="38" rx="23" ry="6" fill="#4E2A14" />
        <ellipse cx="50" cy="38" rx="18.5" ry="4" fill="#C58940" />

        <path d="M80 27l1.6-5 1.6 5 5 1.6-5 1.6-1.6 5-1.6-5-5-1.6 5-1.6Z" fill="#E6B875" />
        <path d="M18 34l1.3-4 1.3 4 4 1.3-4 1.3-1.3 4-1.3-4-4-1.3 4-1.3Z" fill="#E6B875" opacity="0.8" />
      </svg>
    </span>
  );
}

/** Gift illustration used by Reward Unlocked and the Rewards catalogue. */
export function GiftBoxIllustration({ className = "size-24" }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex items-center justify-center", className)}>
      <span
        className="absolute inset-[12%] rounded-full bg-caramel-400/25 blur-xl"
        aria-hidden="true"
      />
      <svg viewBox="0 0 100 100" className="relative size-full" aria-hidden="true">
        <circle cx="20" cy="24" r="2.6" fill="#D4A373" />
        <circle cx="81" cy="29" r="3" fill="#E6B875" />
        <circle cx="14" cy="58" r="2.2" fill="#B97B32" />
        <circle cx="87" cy="64" r="2.6" fill="#D4A373" />
        <circle cx="50" cy="12" r="2.4" fill="#E6B875" />

        <path
          d="M38 34c-8-2-10-10 0-12 8-1 10 10 12 14 2-4 4-15 12-14 10 2 8 10 0 12-6 2-12 2-12 2"
          fill="#E6B875"
          stroke="#C58940"
          strokeWidth="1.4"
        />
        <rect x="24" y="36" width="52" height="12" rx="4" fill="#4E2A14" />
        <rect x="45" y="36" width="10" height="12" fill="#D4A373" />
        <rect x="28" y="48" width="44" height="34" rx="4" fill="#3A1E0D" />
        <rect x="45" y="48" width="10" height="34" fill="#D4A373" />
      </svg>
    </span>
  );
}

/** Celebration burst used behind the Stamp Added / Reward Unlocked graphic. */
export function CelebrationHalo({ className = "size-40" }: { className?: string }) {
  return (
    <span className={cn("pointer-events-none absolute inset-0 flex items-center justify-center", className)} aria-hidden="true">
      <svg viewBox="0 0 160 160" className="size-full">
        <g stroke="#D4A373" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round">
          <path d="M80 8v18" />
          <path d="M80 134v18" />
          <path d="M8 80h18" />
          <path d="M134 80h18" />
          <path d="M29 29l13 13" />
          <path d="M118 118l13 13" />
          <path d="M131 29l-13 13" />
          <path d="M42 118l-13 13" />
        </g>
      </svg>
    </span>
  );
}
