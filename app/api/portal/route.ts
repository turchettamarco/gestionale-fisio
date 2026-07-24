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

    const nowIso = new Date().toISOString();

    const [patientRes, apptRes, historyRes, exercisesRes] = await Promise.all([
      db.from("patients").select("first_name,last_name,studio_id").eq("id", tk.patient_id).maybeSingle(),
      db.from("appointments")
        .select("id,start_at,end_at,status,location,clinic_site,domicile_address,treatment_type")
        .eq("patient_id", tk.patient_id)
        .gte("start_at", nowIso)
        .neq("status", "cancelled")
        .order("start_at", { ascending: true })
        .limit(10),
      // Storico sedute già svolte, con stato di pagamento.
      // package_id serve a distinguere le sedute che scalano da un
      // pacchetto: lì l'incasso sta sul pacchetto (mig. 014), quindi
      // is_paid sull'appuntamento non è indicativo e mostrarle come
      // "da saldare" sarebbe sbagliato verso il paziente.
      db.from("appointments")
        .select("id,start_at,status,treatment_type,is_paid,amount,payment_method,package_id")
        .eq("patient_id", tk.patient_id)
        .lt("start_at", nowIso)
        .neq("status", "cancelled")
        .order("start_at", { ascending: false })
        .limit(50),
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
        .select("name,address,phone,signature_name,signature_title,google_review_link,website,logo_base64,booking_slug,booking_public_enabled,portal_show_amounts")
        .eq("id", studioId)
        .maybeSingle();
      studio = studioRes.data || null;
    }

    // Storico "ripulito" per il paziente: niente id interni di pacchetto,
    // solo l'informazione che serve a lui.
    type HistoryRow = {
      id: string; start_at: string; status: string | null;
      treatment_type: string | null; is_paid: boolean | null;
      amount: number | null; payment_method: string | null;
      package_id: string | null;
    };
    // mig. 087: se lo studio ha scelto di non mostrare gli importi, questi
    // vengono esclusi QUI, lato server. Nasconderli solo nella pagina non
    // servirebbe: resterebbero leggibili nella risposta di rete.
    const showAmounts = studio?.portal_show_amounts !== false;

    const history = ((historyRes.data ?? []) as HistoryRow[]).map(a => ({
      id: a.id,
      start_at: a.start_at,
      treatment_type: a.treatment_type,
      amount: showAmounts ? a.amount : null,
      payment_method: showAmounts ? a.payment_method : null,
      // "package" = inclusa in un pacchetto già pagato a parte
      payment_state: a.package_id ? "package" : (a.is_paid ? "paid" : "unpaid"),
    }));

    return NextResponse.json({
      patient: patientRes.data,
      upcoming: apptRes.data || [],
      history,
      show_amounts: showAmounts,
      exercise_token: exercisesRes.data?.[0]?.token || null,
      studio,
      // Prenotazione online (mig. 083): il pulsante compare solo se lo
      // studio ha davvero attivato la pagina pubblica.
      booking: studio?.booking_public_enabled && studio?.booking_slug
        ? { slug: studio.booking_slug as string }
        : null,
    });
  } catch (e: any) {
    console.error("[portal GET] exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { patient_id, patient_ids } = body ?? {};

    // ── Modalità batch: token per più pazienti in una sola chiamata ──
    // Serve ai client mobile, dove sendReminder è sincrono e il link
    // all'area deve essere già pronto al momento del click.
    if (Array.isArray(patient_ids)) {
      const ids = patient_ids.filter((x: unknown): x is string => typeof x === "string").slice(0, 200);
      if (ids.length === 0) return NextResponse.json({ links: {} });

      const db = getAdmin();
      const nowIso = new Date().toISOString();

      const { data: existingRows } = await db
        .from("patient_portal_tokens")
        .select("token, patient_id, expires_at")
        .in("patient_id", ids)
        .gt("expires_at", nowIso);

      const links: Record<string, string> = {};
      for (const row of existingRows ?? []) {
        // Se un paziente ha più token validi va bene il primo: sono equivalenti
        if (!links[row.patient_id]) links[row.patient_id] = row.token;
      }

      const missing = ids.filter(id => !links[id]);
      if (missing.length > 0) {
        const expires_at = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
        const toInsert = missing.map(id => {
          const token = randomUUID();
          links[id] = token;
          return { token, patient_id: id, expires_at };
        });
        const { error: insErr } = await db.from("patient_portal_tokens").insert(toInsert);
        if (insErr) {
          console.error("[portal POST batch] insert error:", insErr.message);
          // Restituisce almeno quelli già esistenti
          for (const id of missing) delete links[id];
        }
      }

      return NextResponse.json({ links });
    }

    if (!patient_id) return NextResponse.json({ error: "patient_id richiesto" }, { status: 400 });

    const db = getAdmin();

    // Riusa un token ancora valido, se esiste, invece di crearne uno nuovo.
    // Il portale viene ora linkato anche dai promemoria: senza questo, ogni
    // promemoria inviato genererebbe una riga in più e un link diverso, con
    // il paziente che si ritrova tanti indirizzi tutti funzionanti.
    const { data: existing } = await db
      .from("patient_portal_tokens")
      .select("token, expires_at")
      .eq("patient_id", patient_id)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.token) {
      return NextResponse.json({ token: existing.token, url: `/portale/${existing.token}`, reused: true });
    }

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
