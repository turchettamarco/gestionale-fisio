// app/api/booking/route.ts
// POST /api/booking  — crea una richiesta di prenotazione pubblica
// Pubblico — nessun token richiesto, MA studio_id è obbligatorio (mig. 083).
//
// Prima della mig. 083: studio_id non veniva mai passato, e la policy
// booking_requests_anon_insert (mig. 009) richiede studio_id NOT NULL →
// ogni invio falliva con 500. La notifica email andava sempre al "primo
// studio" in ordine di creazione, indipendentemente da quale sito avesse
// generato la richiesta.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabaseServer";
import { romeLocalToUtcISO } from "@/src/lib/booking/time";

interface BookingPayload {
  studio_id:        string;
  location_id?:     string | null;  // sede scelta (mig. 084), opzionale
  service_name:     string;
  service_duration: number;   // minuti
  requested_date:   string;   // "YYYY-MM-DD"
  requested_time:   string;   // "HH:MM"
  patient_name:     string;
  patient_phone:    string;
  patient_email?:   string;
  notes?:           string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export async function POST(req: NextRequest) {
  let body: BookingPayload;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  // Validazione campi obbligatori (studio_id incluso: mig. 083)
  const required: (keyof BookingPayload)[] = [
    "studio_id", "service_name", "service_duration", "requested_date",
    "requested_time", "patient_name", "patient_phone",
  ];
  const missing = required.filter(k => !body[k]);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Campi mancanti: ${missing.join(", ")}` }, { status: 400 });
  }

  if (!UUID_RE.test(body.studio_id)) {
    return NextResponse.json({ error: "studio_id non valido" }, { status: 400 });
  }

  // Lo studio esiste?
  const { data: studio, error: studioErr } = await supabaseAdmin
    .from("studios")
    .select("id, name")
    .eq("id", body.studio_id)
    .maybeSingle();

  if (studioErr) {
    console.error("[booking] studio query error:", studioErr);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
  if (!studio) {
    return NextResponse.json({ error: "Studio non trovato" }, { status: 404 });
  }

  // Se il paziente ha scelto una sede, deve essere una sede di QUESTO
  // studio: senza questo controllo si potrebbe agganciare una richiesta
  // alla sede di un altro studio passando un id arbitrario.
  let locationName: string | null = null;
  if (body.location_id) {
    if (!UUID_RE.test(body.location_id)) {
      return NextResponse.json({ error: "Sede non valida" }, { status: 400 });
    }
    const { data: loc } = await supabaseAdmin
      .from("studio_locations")
      .select("id, name")
      .eq("id", body.location_id)
      .eq("studio_id", body.studio_id)
      .maybeSingle();
    if (!loc) {
      return NextResponse.json({ error: "Sede non valida" }, { status: 400 });
    }
    locationName = loc.name;
  }

  // Sanity check data: formato valido e non nel passato.
  // L'orario richiesto è ITALIANO, quindi va convertito in istante UTC:
  // `new Date("...T14:30:00")` senza fuso userebbe quello del server (UTC
  // su Vercel), spostando l'appuntamento di 1-2 ore.
  if (!DATE_RE.test(body.requested_date) || !TIME_RE.test(body.requested_time)) {
    return NextResponse.json({ error: "Data/ora in formato non valido" }, { status: 400 });
  }

  const slotStartUtc = romeLocalToUtcISO(body.requested_date, body.requested_time);
  const slotStartMs  = new Date(slotStartUtc).getTime();
  if (isNaN(slotStartMs) || slotStartMs < Date.now()) {
    return NextResponse.json({ error: "Data/ora non valida o nel passato" }, { status: 400 });
  }

  const slotEndUtc = new Date(slotStartMs + body.service_duration * 60 * 1000).toISOString();

  // Conflitti in appointments (race condition guard), SOLO per questo studio.
  //
  // Il controllo precedente cercava un appuntamento con start_at < fine
  // slot e basta: bastava una seduta qualsiasi PRIMA nella giornata per
  // far fallire ogni prenotazione successiva con "Slot non più
  // disponibile". Qui si verifica la vera sovrapposizione:
  //   inizio esistente < fine richiesta  AND  fine esistente > inizio richiesta
  let conflictQuery = supabaseAdmin
    .from("appointments")
    .select("id")
    .eq("studio_id", body.studio_id)
    .neq("status", "cancelled")
    .lt("start_at", slotEndUtc)
    .gt("end_at", slotStartUtc);

  // Stesso criterio della route slots: gli appuntamenti senza sede
  // bloccano ovunque, perché non sappiamo dove si svolgano.
  if (body.location_id) {
    conflictQuery = conflictQuery.or(`location_id.eq.${body.location_id},location_id.is.null`);
  }

  const { data: conflict1 } = await conflictQuery.limit(1);

  // Conflitti fra richieste pubbliche già inviate, SOLO per questo studio
  const { data: conflict2 } = await supabaseAdmin
    .from("booking_requests")
    .select("id")
    .eq("studio_id", body.studio_id)
    .eq("requested_date", body.requested_date)
    .in("status", ["pending", "confirmed"])
    .eq("requested_time", body.requested_time)
    .limit(1);

  if ((conflict1 && conflict1.length > 0) || (conflict2 && conflict2.length > 0)) {
    return NextResponse.json(
      { error: "Slot non più disponibile. Scegli un altro orario." },
      { status: 409 }
    );
  }

  // Inserisce la richiesta
  const { data, error } = await supabaseAdmin
    .from("booking_requests")
    .insert({
      studio_id:        body.studio_id,
      location_id:      body.location_id ?? null,
      service_name:     body.service_name,
      service_duration: body.service_duration,
      requested_date:   body.requested_date,
      requested_time:   body.requested_time,
      patient_name:     body.patient_name,
      patient_phone:    body.patient_phone,
      patient_email:    body.patient_email ?? null,
      notes:            body.notes ?? null,
      status:           "pending",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[booking] insert error:", error);
    return NextResponse.json({ error: "Errore salvataggio. Riprova." }, { status: 500 });
  }

  // ─── Email notifica al titolare DELLO STUDIO CHE HA RICEVUTO LA RICHIESTA ──
  // Prima della mig. 083 andava sempre al "primo studio" in ordine di
  // creazione, indipendentemente da quale sito avesse generato la
  // richiesta. Ora usa body.studio_id, quindi funziona anche con più studi.
  try {
    const { sendEmail } = await import("@/src/lib/email");

    const { data: owner } = await supabaseAdmin
      .from("studio_members")
      .select("user_id")
      .eq("studio_id", body.studio_id)
      .in("role", ["owner", "co_owner"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (owner?.user_id) {
      const { data: ownerUser } = await supabaseAdmin.auth.admin.getUserById(owner.user_id);
      const ownerEmail = ownerUser?.user?.email;
      if (ownerEmail) {
        // Format data italiano: "Lunedì 15 Marzo 2026 alle 10:30".
        // timeZone esplicito: il server gira in UTC, senza indicarlo la
        // data mostrata potrebbe slittare al giorno prima.
        const dateStr = new Date(slotStartUtc).toLocaleDateString("it-IT", {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
          timeZone: "Europe/Rome",
        }) + " alle " + body.requested_time;

        const appUrl = process.env.APP_URL || "https://gestionale-fisio.vercel.app";
        await sendEmail({
          template: "booking_received",
          to: ownerEmail,
          studioId: body.studio_id,
          data: {
            studioName: studio.name,
            patientName: body.patient_name,
            patientPhone: body.patient_phone,
            appointmentDate: dateStr,
            treatmentType: locationName
              ? `${body.service_name} — sede: ${locationName}`
              : body.service_name,
            note: body.notes,
            appUrl,
          },
        });
      }
    }
  } catch (emailErr) {
    console.warn("[booking] email notifica fallita:", emailErr);
  }

  return NextResponse.json({ id: data.id, status: "pending" }, { status: 201 });
}
