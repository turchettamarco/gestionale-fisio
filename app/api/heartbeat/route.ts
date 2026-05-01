// ═══════════════════════════════════════════════════════════════════════
// POST /api/heartbeat
// ═══════════════════════════════════════════════════════════════════════
//
// Aggiorna studios.last_active_at per indicare che l'utente è attivo
// nel gestionale in questo momento. Viene chiamato dal client
// (componente <ActivityTracker/>) ogni 5 minuti circa.
//
// Throttle: il DB viene scritto al massimo una volta ogni 5 minuti per studio.
// Se la chiamata arriva entro 5 minuti dall'ultimo aggiornamento, ritorna
// 200 OK senza fare scritture (ottimizzazione).
//
// Autenticazione: cookie session Supabase (l'utente deve essere loggato).
//
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";

const THROTTLE_MS = 5 * 60 * 1000; // 5 minuti

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Configurazione mancante: SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST() {
  try {
    // ─── 1. Verifica utente loggato ─────────────────────────────────
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, reason: "no_session" }, { status: 401 });
    }

    // ─── 2. Trova studio dell'utente ────────────────────────────────
    const admin = getAdminClient();
    const { data: member, error: memberErr } = await admin
      .from("studio_members")
      .select("studio_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberErr) {
      return NextResponse.json({ ok: false, error: memberErr.message }, { status: 500 });
    }

    if (!member?.studio_id) {
      // Utente loggato ma senza studio (es. account in onboarding)
      return NextResponse.json({ ok: true, skipped: "no_studio" });
    }

    // ─── 3. Throttle: leggi last_active_at corrente ────────────────
    const { data: studio } = await admin
      .from("studios")
      .select("last_active_at")
      .eq("id", member.studio_id)
      .maybeSingle();

    const now = Date.now();
    const lastActive = studio?.last_active_at
      ? new Date(studio.last_active_at).getTime()
      : 0;

    if (now - lastActive < THROTTLE_MS) {
      // Aggiornato di recente, evitiamo scrittura DB inutile
      return NextResponse.json({ ok: true, throttled: true });
    }

    // ─── 4. Aggiorna last_active_at ────────────────────────────────
    const { error: updErr } = await admin
      .from("studios")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", member.studio_id);

    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "errore sconosciuto";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
