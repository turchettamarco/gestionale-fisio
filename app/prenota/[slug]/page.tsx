// app/prenota/[slug]/page.tsx
// ════════════════════════════════════════════════════════════════════════
// Pagina PUBBLICA di prenotazione ospitata (mig. 083).
//
// Accessibile SENZA autenticazione tramite URL:
//   https://myfisiohub.app/prenota/{slug}
//
// Lo studio attiva la pagina da Impostazioni → Agenda → "Link di
// prenotazione pubblico" e condivide questo link direttamente (WhatsApp,
// bio Instagram, Google Business...) — non serve un sito web proprio.
//
// SICUREZZA: i dati arrivano da /api/public/booking-info/[slug] e
// /api/booking/slots, entrambe server-side con supabaseAdmin. Il client
// non tocca mai Supabase direttamente.
// ════════════════════════════════════════════════════════════════════════

import { Suspense } from "react";
import PrenotaPublicClient from "./PrenotaPublicClient";

export const metadata = {
  title: "Prenota una visita",
};

export default function PrenotaPublicPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh", background: "#f1f5f9",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#64748b", fontSize: 14, fontWeight: 600,
      }}>
        Caricamento…
      </div>
    }>
      <PrenotaPublicClient />
    </Suspense>
  );
}
