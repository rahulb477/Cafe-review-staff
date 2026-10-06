"use client";

import React, { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useStaffApp } from "@/context/StaffAppContext";
import { BakedLogoIcon } from "@/components/Icons";
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, Loader2, AlertCircle } from "lucide-react";

function StaffLoginContent() {
  const router = useRouter();
  const { login, client, authError } = useStaffApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim()) {
      setErrorMessage("Please enter your staff email.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setErrorMessage("");
    setIsLoading(true);

    try {
      const res = await login(email.trim(), password);
      if (!res.success) {
        setErrorMessage(res.error || "Authentication failed. Please verify your credentials.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred during login.");
    } finally {
      setIsLoading(false);
    }
  };

  const displayError = errorMessage || authError;

  return (
    <div className="min-h-screen bg-[#2D1808] flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Decorative Warm Ambient Coffee Art in Background */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-[#B97B32]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#4A2810]/40 rounded-full blur-3xl pointer-events-none" />

      {/* SVG Floral/Coffee Leaf motif matching Screen 1 */}
      <svg
        className="absolute top-4 left-4 w-32 h-32 text-[#5E3618]/30 pointer-events-none"
        viewBox="0 0 100 100"
        fill="currentColor"
      >
        <path d="M10,90 Q40,10 90,10 Q60,90 10,90 Z" />
        <path d="M30,70 Q50,30 80,30" stroke="#8C5325" strokeWidth="2" fill="none" />
      </svg>
      <svg
        className="absolute bottom-4 right-4 w-36 h-36 text-[#5E3618]/30 pointer-events-none"
        viewBox="0 0 100 100"
        fill="currentColor"
      >
        <path d="M10,90 Q40,10 90,10 Q60,90 10,90 Z" />
        <path d="M30,70 Q50,30 80,30" stroke="#8C5325" strokeWidth="2" fill="none" />
      </svg>

      {/* Main Container / Mobile Frame */}
      <div className="w-full max-w-sm sm:max-w-md relative z-10 flex flex-col items-center">
        {/* Top Branding (Screen 1) */}
        <div className="flex flex-col items-center mb-6 text-center animate-in fade-in slide-in-from-top-4 duration-300">
          <BakedLogoIcon className="w-16 h-16 shadow-lg mb-2" />
          <h1 className="text-2xl font-extrabold text-white tracking-widest">
            {client?.name || "BAKE"}
          </h1>
          <p className="text-[11px] font-semibold text-[#D4A373] tracking-widest uppercase">
            {client?.tagline || "CAFÉ & BAKERY"}
          </p>
        </div>

        {/* Cream Card matching Screen 1 */}
        <div className="w-full bg-[#FFFDF9] rounded-3xl p-6 sm:p-8 shadow-2xl border border-[#E8DACB]">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-[#3A1E0D]">Staff Login</h2>
            <p className="text-xs text-stone-500 mt-1 max-w-xs mx-auto">
              Sign in with your staff credentials to manage loyalty stamps and redemptions
            </p>
          </div>

          {displayError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{displayError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email Field */}
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Staff Email"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 bg-[#FAF6F0] rounded-2xl border border-stone-200 text-xs sm:text-sm text-[#3A1E0D] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#3A1E0D] focus:bg-white transition-all font-medium"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-11 py-3 bg-[#FAF6F0] rounded-2xl border border-stone-200 text-xs sm:text-sm text-[#3A1E0D] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-[#3A1E0D] focus:bg-white transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 focus:outline-none"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Sign In CTA Button (Screen 1) */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-[#3A1E0D] hover:bg-[#4E2A14] active:scale-[0.99] text-white font-bold text-sm rounded-2xl shadow-lg shadow-[#3A1E0D]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#E6B875]" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4 text-[#E6B875] group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            {/* Forgot Password */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-xs font-semibold text-[#8C5D3B] hover:text-[#3A1E0D] transition-colors underline-offset-2 hover:underline"
              >
                Forgot Password?
              </button>
            </div>
          </form>
        </div>

        {/* Bottom Badge (Screen 1) */}
        <div className="mt-6 flex items-center gap-1.5 text-xs text-[#D4A373]/80 font-medium">
          <ShieldCheck className="w-4 h-4 text-[#D4A373]" />
          <span>Firebase Authenticated • Staff Portal</span>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-[#FAF6F0] text-[#3A1E0D] mx-auto flex items-center justify-center mb-3">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg text-[#3A1E0D]">Staff Password Recovery</h3>
            <p className="text-xs text-stone-500 mt-2 leading-relaxed">
              Staff accounts are managed in Firebase Authentication. Please contact your store manager or administrator to reset your credentials.
            </p>
            <button
              onClick={() => setShowForgotModal(false)}
              className="mt-4 w-full py-2.5 bg-[#3A1E0D] text-white rounded-xl text-xs font-bold hover:bg-[#4E2A14]"
            >
              Return to Sign In
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StaffLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#2D1808] flex items-center justify-center text-white">
          <Loader2 className="w-8 h-8 animate-spin text-[#E6B875]" />
        </div>
      }
    >
      <StaffLoginContent />
    </Suspense>
  );
}
