"use client";

// ═══════════════════════════════════════════════════════════════════════
// ConvenzioniMenuItem — voce "Convenzioni" nel menu utente
// ═══════════════════════════════════════════════════════════════════════
//
// Compare solo se il modulo è acceso (studios.convenzioni_enabled).
// Sta nel menu in alto a destra — su desktop e su mobile — perché è roba
// che si apre due volte l'anno: una scheda fissa nella barra sarebbe
// spazio rubato alle cose di tutti i giorni.
// ═══════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { useCurrentStudio } from "@/src/contexts/StudioContext";

export default function ConvenzioniMenuItem({
  onNavigate, borderColor = "#e2e8f0", textColor = "#0f172a",
}: {
  onNavigate?: () => void;
  borderColor?: string;
  textColor?: string;
}) {
  const { studio } = useCurrentStudio();
  if (studio?.convenzioni_enabled !== true) return null;
  return (
    <Link
      href="/convenzioni"
      onClick={onNavigate}
      style={{
        display: "block", padding: "10px 15px", color: textColor,
        fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${borderColor}`,
        textDecoration: "none",
      }}
    >
      Convenzioni
    </Link>
  );
}
