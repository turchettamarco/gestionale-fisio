// app/mobile/(protected)/ospiti/page.tsx
// ════════════════════════════════════════════════════════════════════════
// Wrapper mobile per la pagina indice ospiti.
// Riusa direttamente il client component della versione desktop, che è
// già responsive grazie alle media query CSS (≤768px → 1 colonna).
// ════════════════════════════════════════════════════════════════════════

import { Suspense } from "react";
import OspitiIndexClient from "@/app/(protected)/ospiti/OspitiIndexClient";

export default function MobileOspitiIndexPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontWeight: 800 }}>Caricamento ospiti…</div>}>
      <OspitiIndexClient />
    </Suspense>
  );
}
