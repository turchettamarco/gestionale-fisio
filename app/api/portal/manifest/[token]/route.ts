// app/api/portal/manifest/[token]/route.ts
// ════════════════════════════════════════════════════════════════════════
// Manifest PWA dell'area paziente (tappa 2).
//
// È separato da /manifest.json, che è quello del gestionale: il paziente
// deve installare la SUA area, non l'applicativo dello studio. Per questo
// start_url e scope puntano al suo indirizzo personale — aprendo l'icona
// dalla schermata Home entra già dentro, senza dover ritrovare il link.
//
// Il nome mostrato sotto l'icona è quello dello studio, così sul telefono
// il paziente legge "Studio Rossi" e non un nome generico.
//
// Nessun dato sensibile qui dentro: solo nome dello studio e colori.
// ════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;

  let studioName = "Area Paziente";

  try {
    const db = getAdmin();
    const { data: tk } = await db
      .from("patient_portal_tokens")
      .select("patient_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (tk?.patient_id) {
      const { data: patient } = await db
        .from("patients")
        .select("studio_id")
        .eq("id", tk.patient_id)
        .maybeSingle();

      if (patient?.studio_id) {
        const { data: studio } = await db
          .from("studios")
          .select("name")
          .eq("id", patient.studio_id)
          .maybeSingle();
        if (studio?.name) studioName = studio.name;
      }
    }
  } catch {
    // Nome generico: il manifest deve funzionare comunque
  }

  const base = `/portale/${token}`;

  return NextResponse.json(
    {
      name: `${studioName} — Area Paziente`,
      short_name: studioName.length > 12 ? "Area Paziente" : studioName,
      description: "I tuoi appuntamenti, esercizi e documenti",
      start_url: base,
      scope: base,
      display: "standalone",
      orientation: "portrait",
      background_color: "#f8fafc",
      theme_color: "#0d9488",
      lang: "it-IT",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600",
      },
    }
  );
}
