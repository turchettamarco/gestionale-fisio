// app/portale/[token]/layout.tsx
// ════════════════════════════════════════════════════════════════════════
// Collega l'area paziente al suo manifest PWA (tappa 2), così il paziente
// può fare "Aggiungi a schermata Home" e ritrovarsi un'icona che apre
// direttamente la sua area, a schermo intero e senza barra del browser.
//
// Il manifest è per-paziente (contiene il suo indirizzo come start_url),
// quindi va costruito qui a partire dal token e non può essere un file
// statico in /public.
// ════════════════════════════════════════════════════════════════════════

import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  // Il portale è una pagina da consultare: lo zoom resta permesso, serve
  // a chi ha difficoltà di lettura.
  maximumScale: 5,
};

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Area Paziente",
    description: "I tuoi appuntamenti, esercizi e documenti",
    manifest: `/api/portal/manifest/${token}`,
    appleWebApp: {
      capable: true,
      title: "Area Paziente",
      statusBarStyle: "default",
    },
    // Un'area riservata non deve finire nei motori di ricerca
    robots: { index: false, follow: false },
  };
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
