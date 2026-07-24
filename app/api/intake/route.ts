// app/api/intake/route.ts
// ════════════════════════════════════════════════════════════════════════
// Autovalutazione pre-visita (mig. 093)
//
// GET  /api/intake?token=…  → stato e risposte già salvate
// POST /api/intake           → salva le risposte e chiude il questionario
//
// SICUREZZA: come per consensi e diario, l'unica credenziale è il token
// personale. patient_id e studio_id si ricavano dalla riga, mai dal
// client. Un questionario già completato non si riapre: evita che il
// link, se gira, permetta a qualcun altro di riscrivere le risposte.
// ════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { INTAKE_ALL_QUESTIONS, redFlagsFrom } from "@/src/lib/intakeQuestions";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Token mancante" }, { status: 400 });
  }

  const db = getAdmin();
  const { data: row } = await db
    .from("patient_intake")
    .select("id, patient_id, studio_id, status, payload")
    .eq("access_token", token)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Link non valido" }, { status: 404 });
  }

  const [{ data: patient }, { data: studio }] = await Promise.all([
    db.from("patients").select("first_name").eq("id", row.patient_id).maybeSingle(),
    db.from("studios").select("name, logo_base64").eq("id", row.studio_id).maybeSingle(),
  ]);

  return NextResponse.json({
    status: row.status,
    payload: row.payload ?? {},
    patient_first_name: patient?.first_name ?? null,
    studio: { name: studio?.name ?? null, logo_base64: studio?.logo_base64 ?? null },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body?.token ?? "").trim();
    const answers = body?.answers;

    if (!token || typeof answers !== "object" || answers === null) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    const db = getAdmin();
    const { data: row } = await db
      .from("patient_intake")
      .select("id, patient_id, studio_id, status")
      .eq("access_token", token)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ error: "Link non valido" }, { status: 404 });
    }
    if (row.status === "completed") {
      return NextResponse.json({ error: "Questionario già inviato" }, { status: 409 });
    }

    // Si tiene solo ciò che corrisponde a una domanda vera: il client non
    // può infilare campi arbitrari nel payload.
    const clean: Record<string, unknown> = {};
    for (const q of INTAKE_ALL_QUESTIONS) {
      const v = (answers as Record<string, unknown>)[q.id];
      if (v === undefined || v === null) continue;
      if (q.type === "checkbox") clean[q.id] = v === true;
      else if (q.type === "scale") {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 0 && n <= 10) clean[q.id] = n;
      } else {
        clean[q.id] = String(v).slice(0, 2000);
      }
    }

    const { error } = await db
      .from("patient_intake")
      .update({
        payload: clean,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) {
      console.error("[intake] update error:", error.message);
      return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
    }

    // Notifica allo studio, con il conteggio dei segnali da guardare
    try {
      const flags = redFlagsFrom(clean);
      const { data: patient } = await db
        .from("patients")
        .select("first_name, last_name")
        .eq("id", row.patient_id)
        .maybeSingle();

      await db.from("notifications").insert({
        studio_id: row.studio_id,
        type: "intake",
        patient_id: row.patient_id,
        payload: {
          patient_name: [patient?.first_name, patient?.last_name].filter(Boolean).join(" "),
          red_flags: flags.length,
        },
      });
    } catch (notifyErr) {
      console.warn("[intake] notifica non creata:", notifyErr);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[intake] exception:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
