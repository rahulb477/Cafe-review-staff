import React from "react";

export function CoffeeBeanIcon({ className = "w-5 h-5", color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill={color} className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z"
        fillOpacity="0.1"
      />
      <path
        d="M7.5 4.5C9.5 3 14.5 3 16.5 4.5C19 6.5 20.5 10 19.5 14C18.5 18 15.5 20.5 12 20.5C8.5 20.5 5.5 18 4.5 14C3.5 10 5 6.5 7.5 4.5ZM12 5.5C10 7.5 8.5 10 9 13C9.5 16 11 17.5 12 18.5C13 17 14.5 14.5 14 11.5C13.5 8.5 12.5 6.5 12 5.5Z"
        fill={color}
      />
    </svg>
  );
}

export function BakedLogoIcon({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`rounded-full bg-[#B97B32] p-1.5 flex items-center justify-center text-white shadow-inner ${className}`}>
      <svg viewBox="0 0 32 32" fill="none" className="w-full h-full text-white" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="16" cy="16" rx="14" ry="14" fill="#C58940" />
        <ellipse cx="16" cy="16" rx="11" ry="11" fill="#4A2810" />
        {/* Coffee bean center */}
        <path
          d="M16 8C13 8 10.5 11 11 15C11.5 19 13.5 23 16 24C18.5 23 20.5 19 21 15C21.5 11 19 8 16 8ZM16 10C17.5 12 18 14.5 17.5 17C17 19.5 16.5 21 16 22C15.5 21 14.8 19.5 14.5 17C14 14.5 14.5 12 16 10Z"
          fill="#E6B875"
        />
        <path
          d="M16 10C14.5 12.5 14.5 15.5 16 18C17.5 20.5 16.5 22 16 22"
          stroke="#4A2810"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function CoffeeCupIllustration({ className = "w-24 h-24" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <div className="absolute inset-0 bg-[#E6B875]/20 rounded-full blur-xl animate-pulse"></div>
      <svg viewBox="0 0 100 100" fill="none" className="w-full h-full drop-shadow-md" xmlns="http://www.w3.org/2000/svg">
        {/* Steam */}
        <path d="M42 22C40 18 43 14 41 10" stroke="#D4A373" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
        <path d="M50 20C48 16 52 12 49 8" stroke="#D4A373" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
        <path d="M58 23C56 19 59 15 57 11" stroke="#D4A373" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
        
        {/* Saucer */}
        <ellipse cx="50" cy="78" rx="38" ry="8" fill="#F0E5D8" stroke="#CBB49E" strokeWidth="2" />
        <ellipse cx="50" cy="76" rx="30" ry="5" fill="#E2D4C5" />

        {/* Cup Handle */}
        <path
          d="M66 42C76 42 78 58 65 60"
          fill="none"
          stroke="#4A2810"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Cup Body */}
        <path
          d="M26 36C26 36 28 68 50 68C72 68 74 36 74 36H26Z"
          fill="#4A2810"
        />
        {/* Cup Rim highlight */}
        <ellipse cx="50" cy="36" rx="24" ry="6" fill="#6A3B18" />
        <ellipse cx="50" cy="36" rx="20" ry="4" fill="#C58940" />

        {/* Sparkles */}
        <path d="M78 26L80 20L82 26L88 28L82 30L80 36L78 30L72 28L78 26Z" fill="#E6B875" />
        <path d="M18 32L19.5 28L21 32L25 33.5L21 35L19.5 39L18 35L14 33.5L18 32Z" fill="#E6B875" />
      </svg>
    </div>
  );
}

export function GiftBoxIllustration({ className = "w-24 h-24" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <div className="absolute inset-0 bg-red-400/20 rounded-full blur-xl animate-pulse"></div>
      <svg viewBox="0 0 100 100" fill="none" className="w-full h-full drop-shadow-md" xmlns="http://www.w3.org/2000/svg">
        {/* Confetti dots */}
        <circle cx="20" cy="25" r="3" fill="#E6B875" />
        <circle cx="80" cy="30" r="3.5" fill="#38BDF8" />
        <circle cx="15" cy="55" r="2.5" fill="#4ADE80" />
        <circle cx="85" cy="65" r="3" fill="#F472B6" />
        <circle cx="50" cy="10" r="3" fill="#FB923C" />
        <circle cx="30" cy="18" r="2" fill="#F87171" />
        <circle cx="70" cy="18" r="2.5" fill="#A78BFA" />

        {/* Ribbon Bow */}
        <path
          d="M38 32C30 30 28 22 38 20C46 19 48 30 50 34C52 30 54 19 62 20C72 22 70 30 62 32C56 34 50 34 50 34"
          fill="#FACC15"
          stroke="#EAB308"
          strokeWidth="1.5"
        />

        {/* Lid */}
        <rect x="24" y="34" width="52" height="12" rx="4" fill="#E11D48" stroke="#BE123C" strokeWidth="1.5" />
        <rect x="45" y="34" width="10" height="12" fill="#FACC15" />

        {/* Box base */}
        <rect x="28" y="46" width="44" height="36" rx="4" fill="#BE123C" />
        <rect x="45" y="46" width="10" height="36" fill="#FACC15" />
      </svg>
    </div>
  );
}

export function SingleStampBean({ isFilled, targetNumber }: { isFilled: boolean; targetNumber?: number }) {
  if (isFilled) {
    return (
      <div className="w-8 h-8 rounded-full bg-[#4A2810] shadow-sm flex items-center justify-center transform transition-all duration-300 hover:scale-110">
        <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5 text-[#E6B875]" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="10" cy="10" rx="7" ry="8" fill="#D4A373" />
          <path
            d="M10 4C8.5 6.5 8.5 13.5 10 16C11.5 13.5 11.5 6.5 10 4Z"
            fill="#4A2810"
          />
          <path
            d="M9.8 4C8 7 8 13 9.8 16"
            stroke="#3A1E0D"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full border-2 border-stone-300 border-dashed bg-white/70 flex items-center justify-center text-xs font-semibold text-stone-400">
      {targetNumber ? <span className="text-[10px] text-stone-400">{targetNumber}</span> : null}
    </div>
  );
}
