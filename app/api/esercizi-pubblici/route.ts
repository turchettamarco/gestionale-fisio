// app/api/esercizi-pubblici/route.ts
// Schede esercizi pubbliche condivise con il paziente.
//
// POST { esercizi, patient_id?, patient_name?, note?, token? }
//   Senza token → crea nuova scheda con token UUID sicuro (valido 90 giorni)
//   Con token   → aggiorna scheda esistente
// GET  ?token=... → ritorna scheda
//
// SICUREZZA:
// - Token UUID v4 (128 bit random)
// - Scadenza 90 giorni
// - Nessun fallback ad anon key

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Configurazione mancante: SUPABASE_SERVICE_ROLE_KEY richiesta");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { patient_id, patient_name, esercizi, note } = body;

    if (!esercizi || !Array.isArray(esercizi)) {
      return NextResponse.json({ error: "esercizi richiesti" }, { status: 400 });
    }

    const db = getAdmin();

    // Aggiornamento scheda esistente
    if (body.token) {
      const { error } = await db
        .from("schede_esercizi_pubbliche")
        .update({ esercizi: JSON.stringify(esercizi), note: note ?? null })
        .eq("token", body.token);
      if (error) throw error;
      return NextResponse.json({ token: body.token, url: `/esercizi/${body.token}` });
    }

    // Nuova scheda con token UUID sicuro
    const token = randomUUID();
    const expires_at = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await db.from("schede_esercizi_pubbliche").insert({
      token,
      patient_id: patient_id ?? null,
      patient_name: patient_name ?? "Paziente",
      esercizi: JSON.stringify(esercizi),
      note: note ?? null,
      expires_at,
    });

    if (error) {
      console.error("[esercizi-pubblici POST] insert error:", error.message);
      throw error;
    }

    return NextResponse.json({ token, url: `/esercizi/${token}` });
  } catch (e: any) {
    console.error("[esercizi-pubblici POST] exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) return NextResponse.json({ error: "Token richiesto" }, { status: 400 });

    const db = getAdmin();

    const { data, error } = await db
      .from("schede_esercizi_pubbliche")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Scheda non trovata o scaduta" }, { status: 404 });

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ error: "Questa scheda è scaduta" }, { status: 410 });
    }

    let esercizi: any[] = [];
    try {
      esercizi = JSON.parse(data.esercizi ?? "[]");
    } catch {
      esercizi = [];
    }

    // Recupera studio via patient_id
    let studio = null;
    if ((data as any).patient_id) {
      const { data: p } = await db
        .from("patients")
        .select("studio_id")
        .eq("id", (data as any).patient_id)
        .maybeSingle();
      if (p?.studio_id) {
        const studioRes = await db
          .from("studios")
          .select("name,address,phone,signature_name,signature_title,google_review_link,website,logo_base64")
          .eq("id", p.studio_id)
          .maybeSingle();
        studio = studioRes.data || null;
      }
    }

    return NextResponse.json({
      patient_name: data.patient_name,
      esercizi,
      note: data.note,
      created_at: data.created_at,
      expires_at: data.expires_at,
      studio,
    });
  } catch (e: any) {
    console.error("[esercizi-pubblici GET] exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
