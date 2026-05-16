// app/agenda/[token]/page.tsx
// ════════════════════════════════════════════════════════════════════════
// Pagina PUBBLICA del portale ospite (mig. 032, Step 6c).
//
// Accessibile SENZA autenticazione tramite URL:
//   https://myfisiohub.app/agenda/{access_token}
//
// Il titolare genera il token da Impostazioni → Team → Modifica ospite,
// poi invia il link via WhatsApp/email. L'ospite apre e vede la sua agenda.
//
// SICUREZZA: i dati arrivano dalla API route /api/public-agenda/[token]
// che usa supabaseAdmin server-side. Il client non tocca mai Supabase
// direttamente. Solo lettura, mai mutazione.
// ════════════════════════════════════════════════════════════════════════

import { Suspense } from "react";
import AgendaPublicClient from "./AgendaPublicClient";

export const metadata = {
  title: "Agenda professionale",
};

export default function AgendaPublicPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh", background: "#f1f5f9",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#64748b", fontSize: 14, fontWeight: 600,
      }}>
        Caricamento agenda…
      </div>
    }>
      <AgendaPublicClient />
    </Suspense>
  );
}
