"use client";

// ═══════════════════════════════════════════════════════════════════════════
// IMPOSTAZIONI — ROUTE UNIFICATA (Tappa 6 unificazione mobile/desktop)
//
// Come per /reports, i due client restano distinti per ora:
//   • SettingsDesktopClient — orchestratore con 21 sezioni-componenti
//     (components/sections/*) e navigazione a tab;
//   • SettingsMobileClient — accordion mobile con un sottoinsieme curato
//     di sezioni (13) e UX touch.
//
// Percorso futuro per eliminare il duplicato: adottare nell'accordion
// mobile le sezioni desktop UNA ALLA VOLTA (sono già componenti riusabili),
// verificando la resa a 390px sezione per sezione.
// ═══════════════════════════════════════════════════════════════════════════

import SettingsDesktopClient from "./SettingsDesktopClient";
import SettingsMobileClient from "./SettingsMobileClient";
import { useIsMobile } from "@/src/hooks/useIsMobile";

export default function SettingsPage() {
  const isMobile = useIsMobile();

  // Viewport non ancora noto → sfondo neutro (nessun flash)
  if (isMobile === null) {
    return <div style={{ minHeight: "100vh", background: "#f1f5f9" }} />;
  }

  return isMobile ? <SettingsMobileClient /> : <SettingsDesktopClient />;
}
