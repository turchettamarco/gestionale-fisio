"use client";

import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────
// useIsMobile — hook condiviso per le pagine UNIFICATE.
//
// Ritorna:
//   • null   → primo render, non sappiamo ancora il viewport (SSR-safe).
//              La pagina deve mostrare uno stato neutro per evitare il
//              "flash" della vista sbagliata.
//   • true   → viewport telefono  (< 768px)
//   • false  → viewport desktop/tablet (≥ 768px)
//
// Il breakpoint 768 è allineato al proxy.ts: i tablet vanno alla vista
// desktop, come già avviene con lo sniffing dello user-agent.
// Si aggiorna in tempo reale se la finestra viene ridimensionata o il
// dispositivo ruotato.
// ─────────────────────────────────────────────────────────────────────

const MOBILE_QUERY = "(max-width: 767px)";

export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isMobile;
}
