"use client";

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD — ROUTE UNIFICATA (Tappa 8 unificazione mobile/desktop)
//
// "/" è la home per tutti: la vecchia /mobile viene rediretta qui dal proxy.
//   • DashboardDesktopClient — orchestratore con le 7 sezioni-componenti
//     (components/dashboard/*)
//   • DashboardMobileClient  — home operativa touch (agenda del giorno,
//     azioni rapide, gruppi, KPI)
//
// GroupEventModalMobile e groupHandlers sono stati promossi a
// src/components/mobile/ perché condivisi con il calendario.
// ═══════════════════════════════════════════════════════════════════════════

import DashboardDesktopClient from "./DashboardDesktopClient";
import DashboardMobileClient from "./DashboardMobileClient";
import { ToastProvider } from "@/src/components/mobile/ToastProvider";
import MobileTabBar from "@/src/components/MobileTabBar";
import { useIsMobile } from "@/src/hooks/useIsMobile";

export default function HomePage() {
  const isMobile = useIsMobile();

  // Viewport non ancora noto → sfondo neutro (nessun flash)
  if (isMobile === null) {
    return <div style={{ minHeight: "100vh", background: "#f1f5f9" }} />;
  }

  return isMobile ? (
    <ToastProvider>
      <DashboardMobileClient />
      {/* Tab bar — prima la forniva il layout /mobile, ora la pagina */}
      <MobileTabBar />
    </ToastProvider>
  ) : (
    <DashboardDesktopClient />
  );
}
