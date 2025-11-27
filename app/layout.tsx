import type { Metadata, Viewport } from "next";
import { Fraunces, Chivo_Mono } from "next/font/google";
import "./globals.css";

// 1. Configure the Premium Fonts
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  // Optional: You can specify axes like 'SOFT' for that vintage feel, 
  // but defaults usually work great.
});

const chivo = Chivo_Mono({
  subsets: ["latin"],
  variable: "--font-chivo",
  display: "swap",
});

// 2. Viewport settings (Controls the mobile browser bar color)
export const viewport: Viewport = {
  themeColor: "#0F1A15", // Matches bg-pitch-900
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // Prevents zooming on inputs (optional, good for 'app' feel)
  userScalable: false,
};

// 3. Metadata & Manifest
export const metadata: Metadata = {
  title: "FCFC '26",
  description: "Tahmin Oyunu",
  manifest: "/manifest.webmanifest", // Points to the auto-generated manifest
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FCFC '26",
  },
  icons: {
    icon: "/icon", // Points to the auto-generated icon
    apple: "/icon",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${chivo.variable} font-serif antialiased bg-pitch-900 text-paper`}>
        {children}
      </body>
    </html>
  );
}