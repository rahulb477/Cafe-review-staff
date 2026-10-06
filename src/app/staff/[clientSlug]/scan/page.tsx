"use client";

import React, { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import {
  Flashlight,
  FlashlightOff,
  ImagePlus,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStaffApp } from "@/context/StaffAppContext";
import { FirebaseService } from "@/services/firebaseService";
import { describeErrorForDiagnostics, toStaffServiceError } from "@/services/staffErrors";
import { ScannerContainer, type ScannerPhase } from "@/components/ui/ScannerContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";

/** Decode at most ~5 frames/second — never on every camera frame. */
const DECODE_INTERVAL_MS = 180;
/** Downscale decoded frames; jsQR cost grows with pixel count. */
const MAX_DECODE_WIDTH = 480;
/** Downscale uploaded images before decoding. */
const MAX_UPLOAD_DIMENSION = 1000;

/**
 * Screen 3 — Scan Customer QR.
 *
 * Camera lifecycle is deterministic: permission → loading → live, an explicit
 * denied state with a recovery button, full teardown on cancel / back /
 * unmount / background, and a scan lock so one code produces exactly one
 * Firestore lookup.
 *
 * Resolution chain (unchanged):
 *   payload → customerTokens/{token} → verify token.clientId === staffClientId
 *           → customers/{customerId} → loyaltyAccounts/{customerId}
 * A clientId inside the QR is never trusted; it is always re-checked against
 * the authenticated staff member's clientId inside FirebaseService.
 */
export default function QRScannerPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug;
  const router = useRouter();
  const { playChime, clientId } = useStaffApp();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const loopActiveRef = useRef(false);
  /** Scanning lock — set as soon as a QR is decoded, cleared only by "Scan Again". */
  const scanLockRef = useRef(false);
  const lastDecodeAtRef = useRef(0);
  const mountedRef = useRef(false);
  const canvasContextRef = useRef<CanvasRenderingContext2D | null>(null);

  // Stable refs so the decode loop is never re-created (keeps decoding cheap
  // and stops the effect churn that made the old scanner stutter).
  const clientIdRef = useRef<string | null>(clientId);
  const playChimeRef = useRef(playChime);
  const routerRef = useRef(router);

  useEffect(() => {
    clientIdRef.current = clientId;
  }, [clientId]);
  useEffect(() => {
    playChimeRef.current = playChime;
  }, [playChime]);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const [phase, setPhase] = useState<ScannerPhase>("starting");
  const [torchOn, setTorchOn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  const sessionReady = Boolean(clientId);

  /* ------------------------------------------------------------------ *
   * Camera + decoder lifecycle helpers (idempotent, always safe to call)
   * ------------------------------------------------------------------ */

  /** Stops every MediaStreamTrack and detaches the video element. */
  const releaseCamera = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // already stopped
        }
      }
    }
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {
        // ignore
      }
      if (video.srcObject) video.srcObject = null;
    }
    setTorchOn(false);
  }, []);

  /** Cancels the decode loop (requestAnimationFrame). */
  const stopDecodeLoop = useCallback(() => {
    loopActiveRef.current = false;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /** Full teardown: decoder + camera (Cancel, Back, unmount, pagehide). */
  const releaseEverything = useCallback(() => {
    stopDecodeLoop();
    releaseCamera();
  }, [releaseCamera, stopDecodeLoop]);

  const ensureCameraReady = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false;
    if (streamRef.current && videoRef.current?.srcObject) return true;

    try {
      const isLocalhost =
        window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      if (!window.isSecureContext && !isLocalhost) {
        throw new Error("Camera access requires HTTPS.");
      }
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
        throw new Error("Camera access is not supported by this browser.");
      }

      if (mountedRef.current) setPhase("starting");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      streamRef.current = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play().catch(() => undefined);

      setPhase("live");
      setNotice("");
      return true;
    } catch (error: unknown) {
      console.warn("[scanner] camera notice:", describeErrorForDiagnostics(error));
      if (!mountedRef.current) return false;
      const message = error instanceof Error ? error.message : "";
      const unsupported =
        /not supported|HTTPS/i.test(message) || !navigator.mediaDevices?.getUserMedia;
      setPhase(unsupported ? "unsupported" : "denied");
      setNotice(
        unsupported
          ? "This browser cannot open the camera here. Use Upload QR or Customer Lookup instead."
          : "Camera permission was not granted. Use Upload QR or Customer Lookup instead."
      );
      return false;
    }
  }, []);

  /* ------------------------------------------------------------------ *
   * Scan handling — locked until the user explicitly scans again
   * ------------------------------------------------------------------ */

  const handleScannedPayload = useCallback(
    async (rawQrString: string) => {
      const activeClientId = clientIdRef.current;
      if (!rawQrString || scanLockRef.current) return;

      if (!activeClientId) {
        // The staff session is still resolving: ignore this frame instead of
        // silently killing the decode loop.
        return;
      }

      // Lock immediately: pause the decoder and stop the camera so one code is
      // never processed dozens of times and no Firebase request runs per frame.
      scanLockRef.current = true;
      setPhase("processing");
      setErrorMessage("");
      stopDecodeLoop();
      releaseCamera();
      playChimeRef.current("scan");

      try {
        const customer = await FirebaseService.scanCustomerQr(rawQrString);
        if (!mountedRef.current) return;
        routerRef.current.push(`/staff/${activeClientId}/customers/${customer.id}`);
      } catch (error: unknown) {
        const staffErr = toStaffServiceError(error, "INVALID_QR");
        console.error("[scanner] scan rejected:", describeErrorForDiagnostics(staffErr));
        if (!mountedRef.current) return;
        setErrorMessage(staffErr.message);
        playChimeRef.current("error");
        // Stay locked: the user must choose "Scan Again" to resume scanning.
      }
    },
    [releaseCamera, stopDecodeLoop]
  );

  /* ------------------------------------------------------------------ *
   * Single QR decode pass (downscaled + throttled)
   * ------------------------------------------------------------------ */

  const decodeVideoFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (!video.videoWidth || !video.videoHeight) return;

    if (!canvasContextRef.current) {
      canvasContextRef.current = canvas.getContext("2d", { willReadFrequently: true });
    }
    const context = canvasContextRef.current;
    if (!context) return;

    const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    context.drawImage(video, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    const code = jsQR(imageData.data, width, height, { inversionAttempts: "dontInvert" });
    if (code?.data) {
      void handleScannedPayload(code.data);
    }
  }, [handleScannedPayload]);

  const startDecodeLoop = useCallback(() => {
    if (loopActiveRef.current) return;
    loopActiveRef.current = true;

    const tick = () => {
      if (!loopActiveRef.current || !mountedRef.current) return;
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (!scanLockRef.current && now - lastDecodeAtRef.current >= DECODE_INTERVAL_MS) {
        lastDecodeAtRef.current = now;
        try {
          decodeVideoFrame();
        } catch (error: unknown) {
          console.warn("[scanner] decode notice:", describeErrorForDiagnostics(error));
        }
      }
      if (loopActiveRef.current) {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [decodeVideoFrame]);

  /** Explicit restart — the only way back into the decode loop after a lock. */
  const handleScanAgain = useCallback(async () => {
    scanLockRef.current = false;
    setErrorMessage("");
    setPhase("starting");
    lastDecodeAtRef.current = 0;
    const ready = await ensureCameraReady();
    if (ready && mountedRef.current) startDecodeLoop();
  }, [ensureCameraReady, startDecodeLoop]);

  /* ------------------------------------------------------------------ *
   * Effects: start on mount (once the session is known), stop on unmount
   * ------------------------------------------------------------------ */
  useEffect(() => {
    mountedRef.current = true;
    const videoElement = videoRef.current;

    let cancelled = false;
    const boot = async () => {
      if (!clientIdRef.current) return;
      const ready = await ensureCameraReady();
      if (cancelled || !mountedRef.current) return;
      if (ready && !scanLockRef.current) startDecodeLoop();
    };
    void boot();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      loopActiveRef.current = false;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const stream = streamRef.current;
      streamRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoElement) {
        try {
          videoElement.pause();
        } catch {
          // ignore
        }
        if (videoElement.srcObject) videoElement.srcObject = null;
      }
    };
  }, [ensureCameraReady, startDecodeLoop]);

  // Stop the camera whenever the app leaves the foreground / the page unloads.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopDecodeLoop();
        releaseCamera();
        return;
      }
      // Back in the foreground: only resume when no scan is locked.
      if (!scanLockRef.current && mountedRef.current && clientIdRef.current) {
        void ensureCameraReady().then((ready) => {
          if (ready && !scanLockRef.current && mountedRef.current) startDecodeLoop();
        });
      }
    };

    const handlePageHide = () => {
      loopActiveRef.current = false;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      releaseCamera();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [ensureCameraReady, releaseCamera, startDecodeLoop, stopDecodeLoop]);

  /* ------------------------------------------------------------------ *
   * Controls
   * ------------------------------------------------------------------ */

  const toggleFlashlight = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities?.();
      if (capabilities && "torch" in capabilities) {
        const nextState = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState } as unknown as MediaTrackConstraintSet],
        });
        setTorchOn(nextState);
      } else {
        setNotice("This device does not expose a torch to the browser.");
      }
    } catch (error) {
      console.warn("[scanner] torch notice:", error);
      setNotice("The flashlight could not be toggled on this device.");
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || scanLockRef.current) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(image.width, image.height));
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) {
            setErrorMessage("The selected image could not be read.");
            return;
          }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            void handleScannedPayload(code.data);
          } else {
            setErrorMessage("Could not detect a valid QR code in this image.");
          }
        } catch (error: unknown) {
          console.warn("[scanner] upload decode notice:", describeErrorForDiagnostics(error));
          setErrorMessage("The selected image could not be read.");
        }
      };
      image.onerror = () => setErrorMessage("The selected image could not be read.");
      image.src = String(loadEvent.target?.result || "");
    };
    reader.onerror = () => setErrorMessage("The selected image could not be read.");
    reader.readAsDataURL(file);
  };

  const isLocked = Boolean(errorMessage);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      {/* Offscreen decode canvas — decoding only, never rendered over the UI. */}
      <canvas ref={canvasRef} className="pointer-events-none hidden" aria-hidden="true" />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />

      <ScreenHeader
        title="Scan Customer QR"
        backHref={`/staff/${clientSlug}`}
        onBack={releaseEverything}
      />

      <ScannerContainer
        videoRef={videoRef}
        phase={phase}
        scanning={!isLocked}
        message={
          phase === "starting" && !sessionReady ? "Checking staff session…" : undefined
        }
        onRequestPermission={() => void handleScanAgain()}
        className="aspect-3/4 w-full"
      >
        {/* Preview controls — always above every overlay layer. */}
        <div className="pointer-events-auto absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-3 px-5">
          <button
            type="button"
            onClick={() => void toggleFlashlight()}
            disabled={phase !== "live"}
            aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
            aria-pressed={torchOn}
            className={cn(
              "press-scale inline-flex size-11 items-center justify-center rounded-full",
              "border border-cream-50/20 backdrop-blur-sm",
              "disabled:cursor-not-allowed disabled:opacity-40",
              torchOn
                ? "bg-caramel-300 text-espresso-900"
                : "bg-espresso-950/60 text-cream-100 hover:bg-espresso-950/80"
            )}
          >
            {torchOn ? (
              <Flashlight className="size-[1.15rem]" aria-hidden="true" />
            ) : (
              <FlashlightOff className="size-[1.15rem]" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload QR image"
            className={cn(
              "press-scale inline-flex size-11 items-center justify-center rounded-full",
              "border border-cream-50/20 bg-espresso-950/60 text-cream-100 backdrop-blur-sm",
              "hover:bg-espresso-950/80"
            )}
          >
            <ImagePlus className="size-[1.15rem]" aria-hidden="true" />
          </button>
        </div>
      </ScannerContainer>

      {/* Instruction line */}
      <p className="px-2 text-center text-[0.8rem] font-medium leading-relaxed text-espresso-500">
        {isLocked
          ? "Scanning paused — press Scan Again to continue."
          : "Position the customer's QR code within the frame"}
      </p>

      {notice && !isLocked && (
        <Card radius="lg" tone="sand" className="px-3.5 py-2.5">
          <p className="text-[0.74rem] font-semibold leading-relaxed text-espresso-600">
            {notice}
          </p>
        </Card>
      )}

      {errorMessage && (
        <ErrorState
          inline
          message={errorMessage}
          retryLabel="Scan Again"
          onRetry={() => void handleScanAgain()}
        />
      )}

      {/* Fallbacks that never depend on the camera */}
      {(phase === "denied" || phase === "unsupported") && (
        <div className="grid grid-cols-2 gap-2.5">
          <LinkButton
            href={`/staff/${clientSlug}/customers`}
            variant="secondary"
            size="md"
            onClick={releaseEverything}
          >
            Customer Lookup
          </LinkButton>
          <Button
            variant="secondary"
            size="md"
            iconLeft={<ImagePlus />}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload QR
          </Button>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 pt-1">
        <RefreshCw className="size-3.5 text-espresso-300" aria-hidden="true" />
        <span className="text-[0.68rem] font-medium text-espresso-300">
          Codes are verified against your assigned business
        </span>
      </div>

      {/* Cancel — a real navigation that releases the camera first. */}
      <LinkButton
        href={`/staff/${clientSlug}`}
        variant="secondary"
        size="lg"
        block
        onClick={releaseEverything}
      >
        Cancel
      </LinkButton>
    </div>
  );
}
