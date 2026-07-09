"use client";

// ═══════════════════════════════════════════════════════════════════════════
// CALENDARIO — ROUTE UNIFICATA (Tappa 9 unificazione mobile/desktop)
//
//   • CalendarDesktopClient — griglia settimanale con drag&drop, sidebar,
//     7 hook condivisi (src/hooks/calendar/*), componenti in components/
//   • CalendarMobileClient  — agenda touch giornaliera (con Suspense
//     interno per useSearchParams)
//
// I due client condividono già utils (laneAssignment, reminderMessage,
// locationHelpers), SOAPNotes, waitlist, pacchetti e il modal gruppi.
// Prossimo passo di fusione (fuori da questa migrazione): agganciare il
// client mobile ai 7 hook condivisi, un hook alla volta.
// ═══════════════════════════════════════════════════════════════════════════

import CalendarDesktopClient from "./CalendarDesktopClient";
import CalendarMobileClient from "./CalendarMobileClient";
import { ToastProvider } from "@/src/components/mobile/ToastProvider";
import { useIsMobile } from "@/src/hooks/useIsMobile";

export default function CalendarPage() {
  const isMobile = useIsMobile();

  // Viewport non ancora noto → sfondo neutro (nessun flash)
  if (isMobile === null) {
    return <div style={{ minHeight: "100vh", background: "#f1f5f9" }} />;
  }

  return isMobile ? (
    <ToastProvider>
      <CalendarMobileClient />
    </ToastProvider>
  ) : (
    <CalendarDesktopClient />
  );
}
