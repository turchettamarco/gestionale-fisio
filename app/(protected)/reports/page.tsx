"use client";

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS — ROUTE UNIFICATA (Tappa 5 unificazione mobile/desktop)
//
// Le due viste report sono per ora due client distinti perché hanno feature
// diverse (desktop: multi-operatore, sedi, metodi di pagamento, aging, LTV;
// mobile: grafico a barre con drill-down, mensilità arretrate, anteprima
// stampa). La fusione della LOGICA dati è rimandata alla roadmap /reports
// (tappe già pianificate: filtro sede, noleggi, pacchetti, cohort, YoY…):
// da lì in avanti conviene costruire un hook dati condiviso.
//
// Intanto la ROUTE è una sola: /reports serve telefono e desktop, e i due
// client vivono fianco a fianco in questa cartella.
// ═══════════════════════════════════════════════════════════════════════════

import { Suspense } from "react";
import ReportsClient from "./ReportsClient";
import ReportsMobileClient from "./ReportsMobileClient";
import { useIsMobile } from "@/src/hooks/useIsMobile";

export default function ReportsPage() {
  const isMobile = useIsMobile();

  // Viewport non ancora noto → sfondo neutro (nessun flash)
  if (isMobile === null) {
    return <div style={{ minHeight: "100vh", background: "#f1f5f9" }} />;
  }

  return (
    <Suspense fallback={<div style={{ padding: 24, fontWeight: 900 }}>Caricamento report…</div>}>
      {isMobile ? <ReportsMobileClient /> : <ReportsClient />}
    </Suspense>
  );
}
