// app/api/portal/pain/route.ts
// ════════════════════════════════════════════════════════════════════════
// POST /api/portal/pain — il paziente registra il dolore di oggi (mig. 092)
//
// Body: { token, level (0-10), note? }
//
// SICUREZZA: l'unica credenziale è il token del portale, esattamente come
// per il resto dell'area paziente. Il patient_id NON viene dal client: si
// ricava dal token, così nessuno può scrivere nel diario di un altro
// passando un id diverso.
//
// Riscrivere la stessa giornata aggiorna la riga invece di aggiungerne
// una seconda (vincolo UNIQUE su patient_id + day).
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

/** Data di oggi in Italia, non nel fuso del server (UTC su Vercel). */
function todayInRome(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body?.token ?? "").trim();
    const level = Number(body?.level);
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : null;

    if (!token) {
      return NextResponse.json({ error: "Token mancante" }, { status: 400 });
    }
    if (!Number.isInteger(level) || level < 0 || level > 10) {
      return NextResponse.json({ error: "Valore non valido" }, { status: 400 });
    }

    const db = getAdmin();

    // Token valido e non scaduto?
    const { data: tk } = await db
      .from("patient_portal_tokens")
      .select("patient_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!tk?.patient_id) {
      return NextResponse.json({ error: "Link non valido" }, { status: 404 });
    }
    if (tk.expires_at && new Date(tk.expires_at) < new Date()) {
      return NextResponse.json({ error: "Link scaduto" }, { status: 410 });
    }

    // studio_id dal paziente, mai dal client
    const { data: patient } = await db
      .from("patients")
      .select("studio_id")
      .eq("id", tk.patient_id)
      .maybeSingle();

    if (!patient?.studio_id) {
      return NextResponse.json({ error: "Paziente non trovato" }, { status: 404 });
    }

    // Il diario è attivo per questo studio?
    const { data: studio } = await db
      .from("studios")
      .select("portal_show_pain_diary")
      .eq("id", patient.studio_id)
      .maybeSingle();

    if (studio?.portal_show_pain_diary !== true) {
      return NextResponse.json({ error: "Funzione non attiva" }, { status: 403 });
    }

    const day = todayInRome();

    const { error } = await db
      .from("patient_pain_log")
      .upsert(
        {
          studio_id: patient.studio_id,
          patient_id: tk.patient_id,
          day,
          level,
          note,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "patient_id,day" }
      );

    if (error) {
      console.error("[portal/pain] upsert error:", error.message);
      return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, day, level });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore server";
    console.error("[portal/pain] exception:", msg);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
