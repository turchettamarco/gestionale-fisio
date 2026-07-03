// ═══════════════════════════════════════════════════════════════════════
// app/api/aderenza-studio/route.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Panoramica aderenza esercizi a livello STUDIO (ultimi 7 giorni).
//
// GET /api/aderenza-studio?studio_id=<uuid>
//
// SICUREZZA (a differenza della API pubblica token-based):
//   1. Utente autenticato (cookie Supabase → getUser)
//   2. Membership verificata: l'utente deve appartenere allo studio
//      (studio_members) o esserne il proprietario (studios.owner_id)
//   3. Solo allora si usa il service role per leggere esercizi_aderenza
//      (tabella senza policy, mig. 054) joinando le schede via patients
//
// NB: schede_esercizi_pubbliche NON ha studio_id → il perimetro studio
//     si ottiene con join inner su patients(studio_id).
//
// RESPONSE:
//   {
//     days: 7,
//     items: [{
//       patient_id, first_name, last_name,
//       scheda_id, total_exercises, expired,
//       active_days,           // giorni distinti con almeno 1 spunta (0-7)
//       done_count,            // spunte totali nella finestra
//       last_done,             // "YYYY-MM-DD" | null
//       day_counts: [{ date, count } x7]  // dal più vecchio a oggi
//     }]                       // ordinati per aderenza crescente
//   }
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, supabaseAdmin } from "@/src/lib/supabaseServer";

export const dynamic = "force-dynamic";

function localDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(req: NextRequest) {
  try {
    const studioId = req.nextUrl.searchParams.get("studio_id");
    if (!studioId) {
      return NextResponse.json({ error: "studio_id mancante" }, { status: 400 });
    }

    // ── 1. Autenticazione ──────────────────────────────────────────────
    const sb = await createSupabaseServerClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // ── 2. Membership: membro dello studio o proprietario ──────────────
    let isMember = false;
    {
      const { data: member } = await supabaseAdmin
        .from("studio_members")
        .select("id")
        .eq("studio_id", studioId)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (member) isMember = true;
    }
    if (!isMember) {
      try {
        const { data: studioRow } = await supabaseAdmin
          .from("studios")
          .select("owner_id")
          .eq("id", studioId)
          .maybeSingle();
        if (studioRow && (studioRow as { owner_id?: string }).owner_id === user.id) {
          isMember = true;
        }
      } catch { /* colonna owner_id assente: ci si affida a studio_members */ }
    }
    if (!isMember) {
      return NextResponse.json({ error: "Accesso negato a questo studio" }, { status: 403 });
    }

    // ── 3. Schede dello studio (via join patients) ─────────────────────
    const { data: schedeRaw, error: sErr } = await supabaseAdmin
      .from("schede_esercizi_pubbliche")
      .select("id, patient_id, esercizi, expires_at, created_at, patients!inner(studio_id, first_name, last_name)")
      .eq("patients.studio_id", studioId)
      .order("created_at", { ascending: false });
    if (sErr) throw sErr;

    type SchedaRow = {
      id: string;
      patient_id: string;
      esercizi: string | null;
      expires_at: string | null;
      created_at: string;
      patients: { studio_id: string; first_name: string | null; last_name: string | null } | null;
    };

    // Ultima scheda per paziente (le righe arrivano già ordinate desc)
    const latestByPatient = new Map<string, SchedaRow>();
    for (const row of (schedeRaw as unknown as SchedaRow[]) || []) {
      if (!latestByPatient.has(row.patient_id)) latestByPatient.set(row.patient_id, row);
    }
    const schede = Array.from(latestByPatient.values());
    if (schede.length === 0) {
      return NextResponse.json({ days: 7, items: [] });
    }

    // ── 4. Aderenza ultimi 7 giorni per quelle schede ──────────────────
    const days: string[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return localDateISO(d);
    });
    const since = days[0];

    const schedaIds = schede.map((s) => s.id);
    const { data: adhRaw, error: aErr } = await supabaseAdmin
      .from("esercizi_aderenza")
      .select("scheda_id, done_date")
      .in("scheda_id", schedaIds)
      .gte("done_date", since);
    if (aErr) throw aErr;

    const adh = (adhRaw as { scheda_id: string; done_date: string }[]) || [];
    const byScheda = new Map<string, { done_date: string }[]>();
    for (const r of adh) {
      const key = r.scheda_id;
      const list = byScheda.get(key) ?? [];
      list.push({ done_date: r.done_date.slice(0, 10) });
      byScheda.set(key, list);
    }

    const now = new Date();
    const items = schede.map((s) => {
      let totalExercises = 0;
      try {
        const arr = JSON.parse(s.esercizi ?? "[]");
        totalExercises = Array.isArray(arr) ? arr.length : 0;
      } catch { totalExercises = 0; }

      const rows = byScheda.get(s.id) ?? [];
      const dates = rows.map((r) => r.done_date);
      const distinct = new Set(dates);
      const dayCounts = days.map((date) => ({
        date,
        count: dates.filter((d) => d === date).length,
      }));
      const lastDone = dates.length ? dates.sort().at(-1)! : null;

      return {
        patient_id: s.patient_id,
        first_name: s.patients?.first_name ?? null,
        last_name: s.patients?.last_name ?? null,
        scheda_id: s.id,
        total_exercises: totalExercises,
        expired: !!(s.expires_at && new Date(s.expires_at) < now),
        active_days: distinct.size,
        done_count: dates.length,
        last_done: lastDone,
        day_counts: dayCounts,
      };
    });

    // Ordinati per aderenza crescente (i pazienti da attenzionare in cima)
    items.sort((a, b) =>
      a.active_days - b.active_days ||
      (a.last_name ?? "").localeCompare(b.last_name ?? "")
    );

    return NextResponse.json({ days: 7, items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore interno";
    console.error("[aderenza-studio]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
