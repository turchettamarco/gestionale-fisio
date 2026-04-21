// app/api/survey/route.ts
// Questionario soddisfazione paziente.
//
// POST { _create_token, patient_id, patient_name } → (opzionale) usa token UUID generato lato frontend
//   Per retrocompatibilità, il frontend passa già il token; qui lo salviamo solo.
// GET  ?token=...                                   → risolve token → patient_name
// POST { token, q1, q2, q3 }                        → salva risposta
//
// SICUREZZA:
// - Token generati come UUID v4 dal frontend (tramite crypto.randomUUID)
// - Nessun fallback ad anon key

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Configurazione mancante: SUPABASE_SERVICE_ROLE_KEY richiesta");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// GET: resolve token → patient name
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token richiesto" }, { status: 400 });

  try {
    const db = getAdmin();
    const { data } = await db.from("survey_tokens")
      .select("patient_name")
      .eq("token", token)
      .maybeSingle();

    return NextResponse.json({ patient_name: data?.patient_name ?? "" });
  } catch (e: any) {
    console.error("[survey GET] exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}

// POST: crea token O salva risposta
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;
    if (!token) return NextResponse.json({ error: "Token richiesto" }, { status: 400 });

    const db = getAdmin();

    // Crea token (dal frontend scheda paziente)
    if (body._create_token) {
      const { error } = await db.from("survey_tokens").upsert({
        token,
        patient_id: body.patient_id ?? null,
        patient_name: body.patient_name ?? "",
      }, { onConflict: "token" });

      if (error) {
        console.error("[survey POST create] error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    // Salva risposta questionario
    const { data: tk } = await db.from("survey_tokens")
      .select("patient_id, patient_name")
      .eq("token", token)
      .maybeSingle();

    const { error } = await db.from("survey_responses").insert({
      token,
      patient_id: tk?.patient_id ?? null,
      patient_name: tk?.patient_name ?? "",
      q1_score: body.q1,
      q2_score: body.q2,
      q3_text: body.q3 || null,
    });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[survey POST] exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
