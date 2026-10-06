"use client";

import React from "react";
import { Camera, Loader2, ScanLine } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export type ScannerPhase = "starting" | "live" | "denied" | "processing" | "unsupported";

export interface ScannerContainerProps {
  /** Live camera element ref — owned by the scan page's lifecycle logic. */
  videoRef: React.Ref<HTMLVideoElement>;
  phase: ScannerPhase;
  /** Animated scan line inside the frame. */
  scanning?: boolean;
  message?: string;
  /** Permission-denied recovery affordance. */
  onRequestPermission?: () => void;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Presentational camera frame for "Scan Customer QR" (screen 3).
 *
 * All camera lifecycle work (permission request, decode loop, track release,
 * scan locking) stays in the page so it is deterministic; this component only
 * renders the rounded preview, the warm overlay, the four corner brackets and
 * the state layers. Every decorative layer is pointer-events-none so a control
 * can never be swallowed by the video.
 */
export function ScannerContainer({
  videoRef,
  phase,
  scanning = true,
  message,
  onRequestPermission,
  children,
  className,
}: ScannerContainerProps) {
  const isLive = phase === "live" || phase === "processing";

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-2xl border border-espresso-900/60",
        "bg-espresso-950 shadow-raise",
        className
      )}
    >
      <video
        ref={videoRef}
        className={cn(
          "pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-300",
          isLive ? "opacity-100" : "opacity-0"
        )}
        muted
        playsInline
        autoPlay
        aria-label="Camera preview"
      />

      {/* Warm dark overlay so the frame reads against any background. */}
      <div className="pointer-events-none absolute inset-0 bg-espresso-950/45" aria-hidden="true" />

      {/* Centred detection area with four corner brackets. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-5">
        {/* Sized from the container width only, so the frame can never exceed
            the preview height on short/wide viewports. */}
        <div className="relative aspect-square w-[min(15.5rem,74%)]">
          <span className="absolute top-0 left-0 size-8 rounded-tl-lg border-t-[3px] border-l-[3px] border-cream-100" />
          <span className="absolute top-0 right-0 size-8 rounded-tr-lg border-t-[3px] border-r-[3px] border-cream-100" />
          <span className="absolute bottom-0 left-0 size-8 rounded-bl-lg border-b-[3px] border-l-[3px] border-cream-100" />
          <span className="absolute right-0 bottom-0 size-8 rounded-br-lg border-r-[3px] border-b-[3px] border-cream-100" />

          {scanning && phase === "live" && (
            <span className="animate-scan-line absolute inset-x-2 h-0.5 rounded-full bg-caramel-300 shadow-[0_0_14px_rgba(230,184,117,0.85)]" />
          )}

          {phase === "live" && (
            <span className="absolute inset-x-0 -bottom-9 flex items-center justify-center gap-1.5 text-[0.68rem] font-semibold text-cream-200/85">
              <ScanLine className="size-3.5" aria-hidden="true" />
              Scanning…
            </span>
          )}
        </div>
      </div>

      {phase === "processing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-espresso-950/78 px-6 text-center">
          <Loader2 className="size-8 animate-spin text-caramel-300" aria-hidden="true" />
          <p className="text-[0.78rem] font-bold tracking-wide text-cream-100">
            Validating customer QR…
          </p>
        </div>
      )}

      {phase === "starting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-espresso-950/85 px-6 text-center">
          <Loader2 className="size-7 animate-spin text-caramel-300" aria-hidden="true" />
          <p className="text-[0.78rem] font-semibold text-cream-100">
            {message || "Starting camera…"}
          </p>
        </div>
      )}

      {(phase === "denied" || phase === "unsupported") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-espresso-950/92 px-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-espresso-800 text-caramel-300">
            <Camera className="size-7" aria-hidden="true" />
          </span>
          <p className="text-[0.9rem] font-bold text-cream-100">
            {phase === "unsupported" ? "Camera unavailable" : "Camera access needed"}
          </p>
          <p className="max-w-[17rem] text-[0.74rem] font-medium leading-relaxed text-cream-300/80">
            {message ||
              "Allow camera access to scan loyalty QR codes, or use Upload QR / Customer Lookup instead."}
          </p>
          {phase === "denied" && onRequestPermission && (
            <Button size="sm" variant="primary" onClick={onRequestPermission} className="mt-1">
              Allow Camera Access
            </Button>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
