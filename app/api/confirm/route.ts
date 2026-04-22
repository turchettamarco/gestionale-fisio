// app/api/confirm/route.ts
// Sistema sicuro di conferma appuntamenti tramite token UUID casuali.
//
// POST { appointment_id }         → genera nuovo token UUID sicuro
// GET  ?token=...                 → risolve token → dati appuntamento
// POST { token, action }          → conferma o annulla appuntamento
//
// SICUREZZA:
// - Token sono UUID v4 casuali (128 bit random)
// - Salvati nella tabella confirm_tokens con scadenza 30 giorni
// - Dopo l'uso sono marcati come "used" ma restano validi per rivedere lo stato
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

// GET: risolve token → dati appuntamento
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Token richiesto" }, { status: 400 });

  try {
    const db = getAdmin();

    const { data: tk, error: tkErr } = await db
      .from("confirm_tokens")
      .select("appointment_id, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (tkErr) {
      console.error("[confirm GET] token lookup error:", tkErr.message);
      return NextResponse.json({ error: "Errore database" }, { status: 500 });
    }
    if (!tk) return NextResponse.json({ error: "Link non valido" }, { status: 404 });
    if (tk.expires_at && new Date(tk.expires_at) < new Date()) {
      return NextResponse.json({ error: "Link scaduto" }, { status: 410 });
    }

    const { data: appt, error: apptErr } = await db
      .from("appointments")
      .select("id, start_at, status, location, clinic_site, domicile_address, studio_id, patients(first_name,last_name)")
      .eq("id", tk.appointment_id)
      .maybeSingle();

    if (apptErr || !appt) {
      return NextResponse.json({ error: "Appuntamento non trovato" }, { status: 404 });
    }

    // Recupera dati studio per branding
    let studio = null;
    if ((appt as any).studio_id) {
      const studioRes = await db
        .from("studios")
        .select("name,address,phone,signature_name,signature_title,google_review_link,website")
        .eq("id", (appt as any).studio_id)
        .maybeSingle();
      studio = studioRes.data || null;
    }

    return NextResponse.json({
      id: appt.id,
      start_at: appt.start_at,
      status: appt.status,
      location: appt.location,
      clinic_site: appt.clinic_site,
      domicile_address: appt.domicile_address,
      patient: Array.isArray(appt.patients) ? appt.patients[0] : appt.patients,
      already_used: !!tk.used_at,
      studio,
    });
  } catch (e: any) {
    console.error("[confirm GET] exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}

// POST: genera nuovo token OPPURE esegue azione
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getAdmin();

    // CASO 1: genera nuovo token
    if (body.appointment_id && !body.token) {
      const { appointment_id } = body;

      const { data: appt } = await db
        .from("appointments")
        .select("id")
        .eq("id", appointment_id)
        .maybeSingle();

      if (!appt) {
        return NextResponse.json({ error: "Appuntamento non trovato" }, { status: 404 });
      }

      const token = randomUUID();
      const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await db.from("confirm_tokens").insert({
        token,
        appointment_id,
        expires_at,
      });

      if (error) {
        console.error("[confirm POST create] insert error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ token });
    }

    // CASO 2: conferma o annulla
    if (body.token && body.action) {
      const { token, action } = body;

      if (action !== "confirm" && action !== "cancel") {
        return NextResponse.json({ error: "Azione non valida" }, { status: 400 });
      }

      const { data: tk, error: tkErr } = await db
        .from("confirm_tokens")
        .select("appointment_id, expires_at, used_at")
        .eq("token", token)
        .maybeSingle();

      if (tkErr || !tk) return NextResponse.json({ error: "Link non valido" }, { status: 404 });
      if (tk.expires_at && new Date(tk.expires_at) < new Date()) {
        return NextResponse.json({ error: "Link scaduto" }, { status: 410 });
      }

      const newStatus = action === "cancel" ? "cancelled" : "confirmed";

      const { error: updErr } = await db
        .from("appointments")
        .update({ status: newStatus })
        .eq("id", tk.appointment_id);

      if (updErr) throw updErr;

      await db
        .from("confirm_tokens")
        .update({ used_at: new Date().toISOString(), last_action: action })
        .eq("token", token);

      return NextResponse.json({ ok: true, status: newStatus });
    }

    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  } catch (e: any) {
    console.error("[confirm POST] exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
