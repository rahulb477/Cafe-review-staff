import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { StaffAppProvider } from "@/context/StaffAppContext";

export const metadata: Metadata = {
  title: "BAKE - Staff Loyalty Experience Platform",
  description: "Real production-ready staff loyalty application for customer lookup, QR scanning, loyalty stamps, and reward redemptions.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#3A1E0D",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#F8F4EC] text-[#2D1808] antialiased min-h-screen">
        <StaffAppProvider>
          {children}
        </StaffAppProvider>
      </body>
    </html>
  );
}
