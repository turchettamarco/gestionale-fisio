// app/(protected)/ospiti/[id]/page.tsx
// ════════════════════════════════════════════════════════════════════════
// Pagina agenda professionista ospite (mig. 029 + Step 5d).
// Server component minimale che fa solo da wrapper per il client component.
// La logica vera è in ./AgendaOspiteClient.tsx.
// ════════════════════════════════════════════════════════════════════════

import { Suspense } from "react";
import MobileOnlyTabBar from "@/src/components/MobileOnlyTabBar";
import AgendaOspiteClient from "./AgendaOspiteClient";

export default function AgendaOspitePage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontWeight: 800 }}>Caricamento agenda…</div>}>
      <AgendaOspiteClient />
      <MobileOnlyTabBar />
    </Suspense>
  );
}
