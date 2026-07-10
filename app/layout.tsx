import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PWARegister from "./pwa-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ────────────────────────────────────────────────────────────────────────────
// app/layout.tsx
// Root layout dell'app. Definisce:
//  - <html lang="it"> + font Geist
//  - Metadata globali (title, description, manifest PWA)
//  - Icons (favicon ICO/SVG/16/32, apple-touch, PWA 192/512)
//  - OpenGraph + Twitter card con og-image (anteprime su WhatsApp/FB/LinkedIn)
//  - Theme color teal #0d9488
//  - Registrazione service worker via <PWARegister />
// ────────────────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: "FisioHub",
  description: "Gestionale per fisioterapisti e osteopati",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FisioHub",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "FisioHub — Gestionale per fisioterapisti e osteopati",
    description:
      "Agenda, pazienti, pacchetti, promemoria WhatsApp. Tutto in un posto solo.",
    url: "https://myfisiohub.app",
    siteName: "FisioHub",
    images: [
      { url: "/og-image.png", width: 1200, height: 630, alt: "FisioHub" },
    ],
    locale: "it_IT",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FisioHub — Gestionale per fisioterapisti e osteopati",
    description:
      "Agenda, pazienti, pacchetti, promemoria WhatsApp. Tutto in un posto solo.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
