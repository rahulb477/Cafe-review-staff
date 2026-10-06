"use client";

import React, { useEffect, useRef, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStaffApp } from "@/context/StaffAppContext";
import { FirebaseService } from "@/services/firebaseService";
import jsQR from "jsqr";
import {
  ChevronLeft,
  Flashlight,
  FlashlightOff,
  Image as ImageIcon,
  AlertCircle,
  Loader2,
  Camera,
} from "lucide-react";

export default function QRScannerPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const resolvedParams = use(params);
  const clientSlug = resolvedParams.clientSlug || "bake";

  const router = useRouter();
  const { playChime, staffUser } = useStaffApp();
  const effectiveClientId = staffUser?.clientId || clientSlug;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Process detected QR code payload with Firebase Token Architecture
  const handleScannedPayload = useCallback(async (rawQrString: string) => {
    setIsProcessing(true);
    setIsScanning(false);
    setErrorMessage("");
    playChime("scan");

    try {
      const customer = await FirebaseService.scanAndResolveCustomer(rawQrString, effectiveClientId);
      router.push(`/staff/${clientSlug}/customers/${customer.id}`);
    } catch (err: any) {
      console.error("Scan error:", err);
      const msg = err.message || "Invalid customer QR token.";
      setErrorMessage(msg);
      playChime("error");
      setIsProcessing(false);
      setTimeout(() => {
        setIsScanning(true);
      }, 3000);
    }
  }, [clientSlug, effectiveClientId, playChime, router]);

  // Initialize Camera Stream
  useEffect(() => {
    let active = true;

    async function startCamera() {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          setHasCameraPermission(false);
          setErrorMessage("Camera access is not supported by this browser environment.");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          await videoRef.current.play();
          setHasCameraPermission(true);
          setErrorMessage("");
        }
      } catch (err: any) {
        console.warn("Camera init notice:", err);
        setHasCameraPermission(false);
        setErrorMessage("Camera access was not granted. You can scan by uploading a pass photo or looking up customer by ID.");
      }
    }

    startCamera();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Continuous QR Code Scanning Loop via Canvas & jsQR
  useEffect(() => {
    let animationFrameId: number;

    const scanFrame = () => {
      if (
        isScanning &&
        !isProcessing &&
        videoRef.current &&
        videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA &&
        canvasRef.current
      ) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code && code.data) {
            handleScannedPayload(code.data);
            return;
          }
        }
      }

      if (isScanning && !isProcessing) {
        animationFrameId = requestAnimationFrame(scanFrame);
      }
    };

    animationFrameId = requestAnimationFrame(scanFrame);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isScanning, isProcessing, handleScannedPayload]);

  // Toggle Torch/Flashlight
  const toggleFlashlight = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const capabilities = (track.getCapabilities && track.getCapabilities()) || {};
        if ("torch" in capabilities) {
          const nextState = !torchOn;
          await (track as any).applyConstraints({
            advanced: [{ torch: nextState }],
          });
          setTorchOn(nextState);
        } else {
          setTorchOn(!torchOn);
        }
      } catch {
        setTorchOn(!torchOn);
      }
    }
  };

  // Handle Photo Upload Scanning
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code && code.data) {
          handleScannedPayload(code.data);
        } else {
          setErrorMessage("Could not detect a valid QR code in this image.");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-[85vh] flex flex-col justify-between max-w-md mx-auto select-none">
      {/* Hidden Canvas for QR decoding */}
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
        {/* Real Live Video Feed */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
        />

        {/* Fallback Viewport Background when Camera is Inactive */}
        {hasCameraPermission === false && (
          <div className="absolute inset-0 bg-[#2D1808]/90 flex flex-col items-center justify-center p-6 text-center text-white/90">
            <Camera className="w-12 h-12 text-[#E6B875] mb-2 animate-bounce" />
            <p className="text-sm font-semibold">Camera Scanner</p>
            <p className="text-xs text-stone-300 mt-1 max-w-xs">
              Upload a pass photo or look up by ID to verify a customer.
            </p>
          </div>
        )}

        {/* Ambient Dark Overlay with Cutout */}
        <div className="absolute inset-0 bg-black/40 pointer-events-none" />

        {/* White Glowing Scanning Target Box (Screen 3) */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl border-2 border-white/60 shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center justify-center overflow-hidden">
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
        <div className="absolute bottom-5 inset-x-8 flex items-center justify-between z-20">
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
          Position the customer&apos;s QR code within the frame
        </p>
      </div>

      {/* Error Banner if any */}
      {errorMessage && (
        <div className="mb-3 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{errorMessage}</span>
        </div>
      )}

      {/* Cancel Button (Screen 3) */}
      <div className="pt-2">
        <Link
          href={`/staff/${clientSlug}`}
          className="w-full py-3.5 px-4 bg-[#F5EBE0] hover:bg-[#ECD8C8] active:scale-[0.99] text-[#3A1E0D] font-bold text-sm rounded-2xl border border-[#DFC8B4] text-center block transition-all shadow-xs"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
