"use client";

import React, { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStaffApp } from "@/context/StaffAppContext";
import { FirebaseService } from "@/services/firebaseService";
import { describeErrorForDiagnostics, toStaffServiceError } from "@/services/staffErrors";
import jsQR from "jsqr";
import {
  AlertCircle,
  Camera,
  ChevronLeft,
  Flashlight,
  FlashlightOff,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
} from "lucide-react";

/** Decode at most ~5 frames/second — never on every camera frame. */
const DECODE_INTERVAL_MS = 180;
/** Downscale decoded frames; jsQR cost grows with pixel count. */
const MAX_DECODE_WIDTH = 480;
/** Downscale uploaded images before decoding. */
const MAX_UPLOAD_DIMENSION = 1000;

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

  // Stable refs so the decode loop never needs re-creating (keeps decoding cheap
  // and stops the effect churn that made the old scanner stutter). They are
  // synced in effects, never during render.
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

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

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

  /** Full teardown: decoder + camera (used by Cancel, Back, unmount, pagehide). */
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

      setHasCameraPermission(true);
      return true;
    } catch (error: unknown) {
      console.warn("[scanner] camera notice:", describeErrorForDiagnostics(error));
      if (!mountedRef.current) return false;
      setHasCameraPermission(false);
      setErrorMessage(
        "Camera access was not granted. You can upload a QR image or look up the customer by ID."
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
      setIsProcessing(true);
      setIsScanning(false);
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
        setIsProcessing(false);
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

  /* ------------------------------------------------------------------ *
   * Scan handling — locked until the user explicitly scans again
   * ------------------------------------------------------------------ */

  const handleScanAgain = useCallback(async () => {
    scanLockRef.current = false;
    setErrorMessage("");
    setIsProcessing(false);
    setIsScanning(true);
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

  // Stop the camera whenever the app leaves the foreground / page unloads.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopDecodeLoop();
        releaseCamera();
        return;
      }
      // Back in the foreground: only resume when no scan is locked (Scan Again).
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
      }
    } catch (error) {
      console.warn("Torch control notice:", error);
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

  const sessionReady = Boolean(clientId);

  return (
    <div className="min-h-[85vh] flex flex-col justify-between max-w-md mx-auto select-none">
      {/* Hidden Canvas for QR decoding (decoding only — never rendered over UI) */}
      <canvas ref={canvasRef} className="hidden" />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Top Header matching Screen 3 */}
      <div className="flex items-center justify-between py-2">
        <Link
          href={`/staff/${clientSlug}`}
          onClick={releaseEverything}
          className="w-10 h-10 rounded-full bg-white border border-[#EBDCCF] flex items-center justify-center text-[#3A1E0D] hover:bg-[#FAF4ED] shadow-xs transition-colors"
          aria-label="Back to dashboard"
        >
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-base sm:text-lg font-bold text-[#3A1E0D]">
          Scan Customer QR
        </h1>
        <div className="w-10" />
      </div>

      {/* Main Viewfinder Frame Container (Screen 3) */}
      <div className="relative my-4 aspect-3/4 w-full bg-[#1A0E06] rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center border-2 border-[#4A2810]">
        {/* Real Live Video Feed — pointer-events-none so it can never swallow a tap */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          muted
          playsInline
          autoPlay
        />

        {/* Fallback Viewport Background when Camera is Inactive */}
        {hasCameraPermission === false && (
          <div className="absolute inset-0 bg-[#2D1808]/90 flex flex-col items-center justify-center p-6 text-center text-white/90 pointer-events-none">
            <Camera className="w-12 h-12 text-[#E6B875] mb-2 animate-bounce" />
            <p className="text-sm font-semibold">Camera Scanner</p>
            <p className="text-xs text-stone-300 mt-1 max-w-xs">
              Upload a pass photo or look up by ID to verify a customer.
            </p>
          </div>
        )}

        {hasCameraPermission === null && (
          <div className="absolute inset-0 bg-[#2D1808]/90 flex flex-col items-center justify-center p-6 text-center text-white/90 pointer-events-none">
            <Loader2 className="w-10 h-10 text-[#E6B875] mb-2 animate-spin" />
            <p className="text-sm font-semibold">
              {sessionReady ? "Starting camera..." : "Checking staff session..."}
            </p>
          </div>
        )}

        {/* Ambient Dark Overlay with Cutout */}
        <div className="absolute inset-0 bg-black/40 pointer-events-none" />

        {/* White Glowing Scanning Target Box (Screen 3) */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl border-2 border-white/60 shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center justify-center overflow-hidden pointer-events-none">
          {/* 4 Corner Markers */}
          <div className="absolute top-2 left-2 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-xl" />
          <div className="absolute top-2 right-2 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-xl" />
          <div className="absolute bottom-2 left-2 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-xl" />
          <div className="absolute bottom-2 right-2 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-xl" />

          {/* Animated Glowing Laser Scanning Line */}
          {isScanning && !isProcessing && (
            <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#E6B875] to-transparent shadow-[0_0_12px_#E6B875] animate-scan-line" />
          )}

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center text-white">
              <Loader2 className="w-10 h-10 text-[#E6B875] animate-spin mb-2" />
              <span className="text-xs font-bold tracking-wide">Validating Customer QR...</span>
            </div>
          )}
        </div>

        {/* Bottom Controls Bar inside Frame (Torch & Gallery) */}
        <div className="absolute bottom-5 inset-x-8 flex items-center justify-between z-20 pointer-events-auto">
          {/* Flashlight Button */}
          <button
            type="button"
            onClick={toggleFlashlight}
            className={`w-11 h-11 rounded-full backdrop-blur-md flex items-center justify-center transition-colors shadow-lg ${
              torchOn
                ? "bg-amber-400 text-stone-900"
                : "bg-black/50 text-white hover:bg-black/70"
            }`}
            aria-label="Toggle flashlight"
          >
            {torchOn ? <Flashlight className="w-5 h-5" /> : <FlashlightOff className="w-5 h-5" />}
          </button>

          {/* Upload Photo Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-11 h-11 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md flex items-center justify-center transition-colors shadow-lg cursor-pointer"
            aria-label="Upload QR image"
            title="Upload QR image"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Instructions Text (Screen 3) */}
      <div className="text-center px-4 my-2">
        <p className="text-xs sm:text-sm font-medium text-stone-600">
          {errorMessage && !isProcessing
            ? "Scanning paused — press Scan Again to continue"
            : "Position the customer's QR code within the frame"}
        </p>
      </div>

      {/* Error Banner if any */}
      {errorMessage && (
        <div className="mb-3 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{errorMessage}</span>
          <button
            type="button"
            onClick={() => void handleScanAgain()}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-red-200 text-red-700 font-bold text-[10px] hover:bg-red-50 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Scan Again</span>
          </button>
        </div>
      )}

      {/* Cancel Button (Screen 3) */}
      <div className="pt-2">
        <Link
          href={`/staff/${clientSlug}`}
          onClick={releaseEverything}
          className="w-full py-3.5 px-4 bg-[#F5EBE0] hover:bg-[#ECD8C8] active:scale-[0.99] text-[#3A1E0D] font-bold text-sm rounded-2xl border border-[#DFC8B4] text-center block transition-all shadow-xs"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
