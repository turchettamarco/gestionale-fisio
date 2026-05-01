import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ═══════════════════════════════════════════════════════════════════════
  // BUILD INFO
  // ═══════════════════════════════════════════════════════════════════════
  // Inietta data/ora del momento in cui Next.js compila il progetto.
  // Su Vercel = momento del deploy. In locale = momento del `npm run dev/build`.
  // Visibile lato client come process.env.NEXT_PUBLIC_BUILD_DATE.
  // Usata dal componente <BuildInfo /> nel menu utente.
  // ═══════════════════════════════════════════════════════════════════════
  env: {
    NEXT_PUBLIC_BUILD_DATE:
      process.env.VERCEL_GIT_COMMIT_DATE || new Date().toISOString(),
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CACHE STRATEGY
  // ═══════════════════════════════════════════════════════════════════════
  // Problema: dopo ogni deploy su Vercel, il browser riusa la vecchia
  // versione del JavaScript perché il file HTML è stato cachato.
  // Risultato: i clienti continuano a vedere codice vecchio rotto fino
  // a che non fanno hard-reload manualmente.
  //
  // Soluzione: header `Cache-Control: no-store` sulle pagine HTML.
  // Gli asset JS/CSS con hash nel nome restano cachati normalmente
  // (quelli sì vogliamo cacharli perché cambiano di hash ad ogni deploy
  // e vengono ri-scaricati automaticamente).
  // ═══════════════════════════════════════════════════════════════════════
  async headers() {
    return [
      {
        // Applica a tutte le pagine HTML (non agli asset statici di _next)
        source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|css|js|woff|woff2|ttf|otf)).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
