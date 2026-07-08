"use client";

// ═══════════════════════════════════════════════════════════════════════════
// DETTAGLIO PAZIENTE — ROUTE UNIFICATA (Tappa 7 unificazione mobile/desktop)
//
// I mattoni clinici (scale, consensi, esercizi, pain map, SOAP, pacchetti,
// certificati, galleria foto) erano GIÀ componenti condivisi in
// src/components/patient/: il duplicato era il guscio pagina. I due gusci
// restano per ora client distinti co-locati:
//   • PatientDetailDesktopClient — layout a sidebar/tab desktop
//   • PatientDetailMobileClient  — layout hero + sezioni touch
//
// Con l'intera area /patients unificata, il proxy usa ora il PREFISSO
// "/patients" (lista, /new e /[id] insieme).
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import PatientDetailDesktopClient from "./PatientDetailDesktopClient";
import PatientDetailMobileClient from "./PatientDetailMobileClient";
import { ToastProvider } from "@/src/components/mobile/ToastProvider";
import { useIsMobile } from "@/src/hooks/useIsMobile";

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const resolvedParams = React.use(params as any) as { id: string };
  const isMobile = useIsMobile();

  // Viewport non ancora noto → sfondo neutro (nessun flash)
  if (isMobile === null) {
    return <div style={{ minHeight: "100vh", background: "#f1f5f9" }} />;
  }

  return isMobile ? (
    // ToastProvider montato qui: il client mobile usa showToast e fuori dal
    // vecchio layout /mobile i toast sparirebbero in silenzio.
    <ToastProvider>
      <PatientDetailMobileClient patientId={resolvedParams.id} />
    </ToastProvider>
  ) : (
    <PatientDetailDesktopClient params={resolvedParams} />
  );
}
