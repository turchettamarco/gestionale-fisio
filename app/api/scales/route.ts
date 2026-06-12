// app/api/scales/route.ts
// API pubblica per le scale di valutazione a distanza.
//
// GET  ?token=...  → definizione scala + branding studio (per il paziente)
// POST { token, answers[], note? } → calcola il punteggio SERVER-SIDE,
//   inserisce in clinical_scales (source='remote') e chiude la richiesta.
//
// SICUREZZA (pattern /api/consents):
// - Service role SOLO server-side
// - Punteggio ricalcolato dal server: il client invia solo le risposte
// - Risposte validate contro la definizione (range 0..max per item)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getScale, psfsQuestions, computeScore } from "@/src/lib/scales/defs";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Configurazione mancante: SUPABASE_SERVICE_ROLE_KEY richiesta");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const TOKEN_RE = /^[a-f0-9]{48}$/;

async function findRequest(db: ReturnType<typeof getAdmin>, token: string) {
  return db
    .from("scale_requests")
    .select("id, studio_id, patient_id, scale_type, payload, status, sent_at")
    .eq("access_token", token)
    .maybeSingle();
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Token non valido" }, { status: 400 });
  }

  try {
    const db = getAdmin();
    const { data: r, error } = await findRequest(db, token);
    if (error) {
      console.error("[scales GET] lookup error:", error.message);
      return NextResponse.json({ error: "Errore database" }, { status: 500 });
    }
    if (!r) return NextResponse.json({ error: "Link non valido" }, { status: 404 });

    const def = getScale(r.scale_type);
    if (!def) return NextResponse.json({ error: "Scala non riconosciuta" }, { status: 500 });

    const activities: string[] = Array.isArray(r.payload?.activities) ? r.payload.activities : [];
    const questions = def.psfs ? psfsQuestions(activities) : def.questions;

    let studio = null;
    const studioRes = await db
      .from("studios")
      .select("name, signature_name, signature_title")
      .eq("id", r.studio_id)
      .maybeSingle();
    studio = studioRes.data || null;

    return NextResponse.json({
      status: r.status,
      scale: {
        id: def.id, name: def.name, full: def.full, area: def.area, icon: def.icon,
        questions: questions.map(q => ({
          label: q.label, max: q.max,
          minLabel: q.minLabel ?? null, maxLabel: q.maxLabel ?? null,
        })),
      },
      studio,
    });
  } catch (e) {
    console.error("[scales GET] error:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: { token?: string; answers?: number[]; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const token = body.token ?? "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Token non valido" }, { status: 400 });
  }

  try {
    const db = getAdmin();
    const { data: r, error: lookErr } = await findRequest(db, token);
    if (lookErr) {
      console.error("[scales POST] lookup error:", lookErr.message);
      return NextResponse.json({ error: "Errore database" }, { status: 500 });
    }
    if (!r) return NextResponse.json({ error: "Link non valido" }, { status: 404 });
    if (r.status === "completed") {
      return NextResponse.json({ error: "Questionario già compilato" }, { status: 409 });
    }

    const def = getScale(r.scale_type);
    if (!def) return NextResponse.json({ error: "Scala non riconosciuta" }, { status: 500 });

    const activities: string[] = Array.isArray(r.payload?.activities) ? r.payload.activities : [];
    const questions = def.psfs ? psfsQuestions(activities) : def.questions;

    const answers = Array.isArray(body.answers) ? body.answers : [];
    if (answers.length !== questions.length) {
      return NextResponse.json({ error: "Risposte incomplete" }, { status: 400 });
    }
    for (let i = 0; i < answers.length; i++) {
      const v = answers[i];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > questions[i].max) {
        return NextResponse.json({ error: "Risposte non valide" }, { status: 400 });
      }
    }

    const score = computeScore(def, answers);
    const note = (body.note ?? "").slice(0, 1000) || null;

    const ins = await db
      .from("clinical_scales")
      .insert({
        patient_id: r.patient_id,
        studio_id: r.studio_id,
        scale_type: r.scale_type,
        score,
        details: {
          answers,
          questions: questions.map(q => q.label),
          ...(def.psfs ? { activities } : {}),
        },
        note,
        source: "remote",
      })
      .select("id")
      .single();

    if (ins.error) {
      console.error("[scales POST] insert error:", ins.error.message);
      return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
    }

    // Chiusura condizionata: previene doppio invio concorrente
    const upd = await db
      .from("scale_requests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        clinical_scale_id: ins.data.id,
      })
      .eq("id", r.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (!upd.data) {
      // Richiesta già chiusa da una richiesta concorrente: rimuovo il duplicato
      await db.from("clinical_scales").delete().eq("id", ins.data.id);
      return NextResponse.json({ error: "Questionario già compilato" }, { status: 409 });
    }

    return NextResponse.json({ ok: true, score });
  } catch (e) {
    console.error("[scales POST] error:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
