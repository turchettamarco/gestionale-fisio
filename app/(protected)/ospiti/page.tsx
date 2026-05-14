// app/(protected)/ospiti/page.tsx
// ════════════════════════════════════════════════════════════════════════
// Pagina indice ospiti (mig. 031, Step 5e).
// Lista degli ospiti attivi con riepilogo (count appuntamenti del mese
// corrente). Card cliccabili → vanno a /ospiti/[id].
// ════════════════════════════════════════════════════════════════════════

import { Suspense } from "react";
import OspitiIndexClient from "./OspitiIndexClient";

export default function OspitiIndexPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontWeight: 800 }}>Caricamento ospiti…</div>}>
      <OspitiIndexClient />
    </Suspense>
  );
}
