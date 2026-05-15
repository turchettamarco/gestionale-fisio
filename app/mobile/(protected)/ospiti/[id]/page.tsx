// app/mobile/(protected)/ospiti/[id]/page.tsx
// ════════════════════════════════════════════════════════════════════════
// Wrapper mobile per la pagina dettaglio ospite (agenda + crea/edit).
// Riusa direttamente AgendaOspiteClient della versione desktop, che è
// già responsive (≤768px stack verticale).
// ════════════════════════════════════════════════════════════════════════

import { Suspense } from "react";
import AgendaOspiteClient from "@/app/(protected)/ospiti/[id]/AgendaOspiteClient";

export default function MobileOspiteDetailPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontWeight: 800 }}>Caricamento agenda…</div>}>
      <AgendaOspiteClient />
    </Suspense>
  );
}
