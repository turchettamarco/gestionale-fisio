// app/api/portal/route.ts
// Portale paziente — area riservata con link personale.
//
// POST { patient_id } → genera token UUID sicuro valido 180 giorni
// GET  ?token=...     → dati paziente + prossimi appuntamenti + scheda esercizi
//
// SICUREZZA:
// - Token UUID v4 (128 bit random)
// - Scadenza 180 giorni
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

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token richiesto" }, { status: 400 });

  try {
    const db = getAdmin();
    const { data: tk, error: tkErr } = await db
      .from("patient_portal_tokens")
      .select("patient_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (tkErr) {
      console.error("[portal GET] token error:", tkErr.message);
      return NextResponse.json({ error: "Errore database" }, { status: 500 });
    }
    if (!tk) return NextResponse.json({ error: "Link non valido o scaduto" }, { status: 404 });
    if (tk.expires_at && new Date(tk.expires_at) < new Date()) {
      return NextResponse.json({ error: "Link scaduto — chiedi un nuovo link allo studio" }, { status: 410 });
    }

    const [patientRes, apptRes, exercisesRes] = await Promise.all([
      db.from("patients").select("first_name,last_name,studio_id").eq("id", tk.patient_id).maybeSingle(),
      db.from("appointments")
        .select("id,start_at,end_at,status,location,clinic_site,domicile_address,treatment_type")
        .eq("patient_id", tk.patient_id)
        .gte("start_at", new Date().toISOString())
        .neq("status", "cancelled")
        .order("start_at", { ascending: true })
        .limit(10),
      db.from("schede_esercizi_pubbliche")
        .select("token,created_at")
        .eq("patient_id", tk.patient_id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    // Recupera dati studio (branding) — usa il campo studio_id del paziente
    let studio = null;
    const studioId = (patientRes.data as any)?.studio_id;
    if (studioId) {
      const studioRes = await db
        .from("studios")
        .select("name,address,phone,signature_name,signature_title,google_review_link,website,logo_base64")
        .eq("id", studioId)
        .maybeSingle();
      studio = studioRes.data || null;
    }

    return NextResponse.json({
      patient: patientRes.data,
      upcoming: apptRes.data || [],
      exercise_token: exercisesRes.data?.[0]?.token || null,
      studio,
    });
  } catch (e: any) {
    console.error("[portal GET] exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { patient_id } = await req.json();
    if (!patient_id) return NextResponse.json({ error: "patient_id richiesto" }, { status: 400 });

    const db = getAdmin();

    // UUID v4 sicuro (128 bit random)
    const token = randomUUID();
    const expires_at = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await db.from("patient_portal_tokens").insert({
      token, patient_id, expires_at,
    });
    if (error) {
      console.error("[portal POST] insert error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ token, url: `/portale/${token}` });
  } catch (e: any) {
    console.error("[portal POST] exception:", e?.message);
    if (e?.message?.includes("Configurazione mancante")) {
      return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY non configurata su Vercel." }, { status: 500 });
    }
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
