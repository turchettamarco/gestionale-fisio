"use client";

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN — ROUTE UNIFICATA (Tappa 10 unificazione mobile/desktop)
// Entrambi i client atterrano su "/" dopo il login: la home è unica.
// ═══════════════════════════════════════════════════════════════════════════

import LoginDesktopClient from "./LoginDesktopClient";
import LoginMobileClient from "./LoginMobileClient";
import { useIsMobile } from "@/src/hooks/useIsMobile";

export default function LoginPage() {
  const isMobile = useIsMobile();

  // Viewport non ancora noto → sfondo neutro (nessun flash)
  if (isMobile === null) {
    return <div style={{ minHeight: "100vh", background: "#f1f5f9" }} />;
  }

  return isMobile ? <LoginMobileClient /> : <LoginDesktopClient />;
}
