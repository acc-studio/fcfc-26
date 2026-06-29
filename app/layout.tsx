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

// 2. Viewport settings. The theme-color (mobile browser bar) is set by the
// theme bootstrap script below so it follows the active light/dark theme.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // Prevents zooming on inputs (optional, good for 'app' feel)
  userScalable: false,
};

// Runs before first paint: applies the saved theme, or the OS preference on a
// fresh visit, and syncs the browser-bar color — avoiding a dark/light flash.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('pitch_theme');if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var d=document.documentElement;d.dataset.theme=t;var c=t==='light'?'#E6E3D4':'#0F1A15';var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}m.setAttribute('content',c);}catch(e){document.documentElement.dataset.theme='dark';}})();`;

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
    <html lang="en" suppressHydrationWarning>
      <body className={`${fraunces.variable} ${chivo.variable} font-serif antialiased bg-pitch-900 text-paper`}>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {children}
      </body>
    </html>
  );
}