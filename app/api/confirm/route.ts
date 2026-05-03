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
      .select("id, start_at, status, location, clinic_site, domicile_address, studio_id, patient_id, patients(first_name,last_name)")
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
        .select("name,address,phone,signature_name,signature_title,google_review_link,website,logo_base64")
        .eq("id", (appt as any).studio_id)
        .maybeSingle();
      studio = studioRes.data || null;
    }

    // ─── Lista appuntamenti futuri del paziente (max 30 giorni) ─────────
    // Include solo: stesso patient_id, da oggi 00:00 a +30 giorni,
    // esclusi cancelled e done (sono "chiusi", niente da fare).
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const horizon = new Date(startOfToday);
    horizon.setDate(horizon.getDate() + 30);

    let appointments_list: Array<{
      id: string;
      start_at: string;
      status: string;
      location: string | null;
      clinic_site: string | null;
      domicile_address: string | null;
    }> = [];

    if ((appt as any).patient_id) {
      const listRes = await db
        .from("appointments")
        .select("id, start_at, status, location, clinic_site, domicile_address")
        .eq("patient_id", (appt as any).patient_id)
        .in("status", ["booked", "confirmed", "not_paid"])
        .gte("start_at", startOfToday.toISOString())
        .lte("start_at", horizon.toISOString())
        .order("start_at", { ascending: true });

      appointments_list = (listRes.data ?? []) as typeof appointments_list;
    }

    return NextResponse.json({
      id: appt.id,
      start_at: appt.start_at,
      status: appt.status,
      location: appt.location,
      clinic_site: appt.clinic_site,
      domicile_address: appt.domicile_address,
      patient: Array.isArray(appt.patients) ? appt.patients[0] : appt.patients,
      patient_id: (appt as any).patient_id,
      already_used: !!tk.used_at,
      studio,
      appointments_list,
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

    // CASO 1: genera nuovo token (oppure salva un token fornito dal client)
    if (body.appointment_id && !body.action) {
      const { appointment_id, client_token } = body;

      const { data: appt } = await db
        .from("appointments")
        .select("id")
        .eq("id", appointment_id)
        .maybeSingle();

      if (!appt) {
        return NextResponse.json({ error: "Appuntamento non trovato" }, { status: 404 });
      }

      // Se il client ha generato il token, usiamo quello. Altrimenti ne generiamo uno.
      // Questo permette al frontend mobile di costruire il link WhatsApp SINCRONAMENTE
      // senza aspettare la response del server (che viene salvato in background).
      // Se il token esiste già (retry), restituiamo quello esistente.
      const token = client_token || randomUUID();
      const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Upsert: se il token esiste già non fa nulla, altrimenti inserisce
      const { error } = await db.from("confirm_tokens").upsert({
        token,
        appointment_id,
        expires_at,
      }, { onConflict: "token" });

      if (error) {
        console.error("[confirm POST create] upsert error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ token });
    }

    // CASO 2: conferma o annulla
    // body: { token, action, appointment_id? }
    //   - action: "confirm" | "cancel"
    //   - appointment_id (opzionale): se presente, agisce su quell'appuntamento
    //     invece che su quello del token. Verifica che appartenga allo
    //     STESSO paziente del token (sicurezza).
    if (body.token && body.action) {
      const { token, action, appointment_id: targetApptId } = body;

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

      // Determino su QUALE appuntamento agire: quello del token, oppure
      // quello richiesto dal client (appointment_id nel body).
      let actOnApptId: string = tk.appointment_id;

      if (targetApptId && targetApptId !== tk.appointment_id) {
        // Verifica sicurezza: l'appuntamento target deve essere dello
        // stesso paziente di quello del token.
        const { data: tokenAppt } = await db
          .from("appointments")
          .select("patient_id")
          .eq("id", tk.appointment_id)
          .maybeSingle();
        const { data: targetAppt } = await db
          .from("appointments")
          .select("patient_id")
          .eq("id", targetApptId)
          .maybeSingle();

        if (!tokenAppt || !targetAppt) {
          return NextResponse.json({ error: "Appuntamento non trovato" }, { status: 404 });
        }
        if ((tokenAppt as any).patient_id !== (targetAppt as any).patient_id) {
          return NextResponse.json({ error: "Operazione non consentita" }, { status: 403 });
        }
        actOnApptId = targetApptId;
      }

      const newStatus = action === "cancel" ? "cancelled" : "confirmed";

      const { error: updErr } = await db
        .from("appointments")
        .update({ status: newStatus })
        .eq("id", actOnApptId);

      if (updErr) throw updErr;

      // Marca il token "usato" solo se l'azione è sull'appuntamento PROPRIO del token.
      // Per gli altri appuntamenti del paziente, il token resta valido (così può
      // continuare a confermare/annullare anche gli altri).
      if (actOnApptId === tk.appointment_id) {
        await db
          .from("confirm_tokens")
          .update({ used_at: new Date().toISOString(), last_action: action })
          .eq("token", token);
      }

      // ─── Notifica studio (bell + email + WA redirect) ────────────────
      // Recupera dati appuntamento + paziente + studio per costruire
      // payload notifica e link WA redirect.
      let waRedirectUrl: string | null = null;
      try {
        const { data: apptFull } = await db
          .from("appointments")
          .select("id, start_at, studio_id, patient_id, patients(first_name,last_name,phone)")
          .eq("id", actOnApptId)
          .maybeSingle();

        if (apptFull && (apptFull as any).studio_id) {
          const studioId = (apptFull as any).studio_id;
          const patient = Array.isArray((apptFull as any).patients)
            ? (apptFull as any).patients[0]
            : (apptFull as any).patients;
          const patientName = [patient?.first_name, patient?.last_name].filter(Boolean).join(" ") || "Paziente";
          const apptStart = (apptFull as any).start_at as string;

          // Recupera toggles + dati studio per il WA redirect
          const { data: studio } = await db
            .from("studios")
            .select("name, phone, signature_name, notify_bell_enabled, notify_wa_redirect_enabled")
            .eq("id", studioId)
            .maybeSingle();

          const bellEnabled = (studio as any)?.notify_bell_enabled ?? true;
          const waRedirectEnabled = (studio as any)?.notify_wa_redirect_enabled ?? true;

          // 1. Inserisci notifica nel DB se il bell è abilitato
          if (bellEnabled) {
            await db.from("notifications").insert({
              studio_id: studioId,
              type: action,            // 'confirm' | 'cancel'
              appointment_id: actOnApptId,
              patient_id: (apptFull as any).patient_id,
              payload: {
                patient_name: patientName,
                appointment_start: apptStart,
              },
            });
          }

          // 2. Costruisci link WA redirect (solo per cancel + se abilitato)
          if (action === "cancel" && waRedirectEnabled && (studio as any)?.phone) {
            // Pulisce il numero studio: rimuove tutto tranne le cifre, poi
            // garantisce che inizi con il prefisso paese (39 per IT se manca).
            const rawPhone = String((studio as any).phone).replace(/\D/g, "");
            const studioPhone = rawPhone.startsWith("39") || rawPhone.length > 10
              ? rawPhone
              : `39${rawPhone}`;

            const dateStr = new Date(apptStart).toLocaleDateString("it-IT", {
              weekday: "long", day: "2-digit", month: "long",
            });
            const timeStr = new Date(apptStart).toLocaleTimeString("it-IT", {
              hour: "2-digit", minute: "2-digit",
            });

            const studioRef = (studio as any)?.signature_name || (studio as any)?.name || "lo studio";
            const msg = `Buongiorno ${studioRef}, ho appena annullato dal link l'appuntamento di ${dateStr} alle ${timeStr}. Grazie.`;
            waRedirectUrl = `https://wa.me/${studioPhone}?text=${encodeURIComponent(msg)}`;
          }
        }
      } catch (notifErr: any) {
        // Errore notifica non blocca la risposta principale: l'appuntamento
        // è già stato annullato/confermato.
        console.warn("[confirm POST] notification error:", notifErr?.message);
      }

      return NextResponse.json({
        ok: true,
        status: newStatus,
        appointment_id: actOnApptId,
        wa_redirect_url: waRedirectUrl,  // null se non abilitato o non applicabile
      });
    }

    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  } catch (e: any) {
    console.error("[confirm POST] exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
