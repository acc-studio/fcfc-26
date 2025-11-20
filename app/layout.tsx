import type { Metadata } from "next";
import { Fraunces, Chivo_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ 
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const chivo = Chivo_Mono({ 
  subsets: ["latin"],
  variable: "--font-chivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FCFC '26",
  description: "FCFC'26 Tahmin Oyunu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${chivo.variable} font-serif antialiased`}>
        {children}
      </body>
    </html>
  );
}