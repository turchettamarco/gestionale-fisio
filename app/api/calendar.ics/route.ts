// app/api/calendar.ics/route.ts
//
// GET /api/calendar.ics?token=<uuid>
//
// Restituisce gli appuntamenti SOLO dello studio identificato dal token,
// in formato iCalendar (.ics) — compatibile con Google Calendar, Apple
// Calendar, Outlook.
//
// SICUREZZA — multi-tenancy:
// Prima dell'introduzione del token (migration 007), questo endpoint
// esponeva gli appuntamenti di TUTTI gli studi a chiunque conoscesse
// l'URL. Era una violazione grave della separazione dei dati tra clienti.
// Ora ogni studio ha il proprio token UUID univoco e l'endpoint filtra
// rigorosamente per studio_id corrispondente.
//
// L'utente trova il suo URL completo nelle Impostazioni → Google Calendar.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service role per bypassare RLS — questo endpoint è server-side only.
// SICUREZZA: niente fallback su anon_key. Se la SERVICE_ROLE_KEY non è configurata
// l'endpoint deve fallire in modo controllato (vedi check in GET sotto), per
// evitare che venga servito con permessi anon (che non vedrebbero gli appuntamenti
// per via di RLS, ma è meglio rendere l'errore esplicito).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

// ── Helpers ICS ──────────────────────────────────────────────────────────────

function escapeICS(str: string): string {
  return (str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function toICSDate(iso: string): string {
  // Converte ISO 8601 UTC → ora locale Europe/Rome per ICS con TZID
  // Supabase restituisce UTC (es. "2026-04-17T09:00:00+00:00")
  // Google Calendar con TZID=Europe/Rome si aspetta l'orario LOCALE italiano
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour").replace("24","00")}${get("minute")}${get("second")}`;
}

function foldLine(line: string): string {
  // RFC 5545: righe > 75 caratteri vanno spezzate con CRLF + spazio
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  chunks.push(line.slice(0, 75));
  let pos = 75;
  while (pos < line.length) {
    chunks.push(" " + line.slice(pos, pos + 74));
    pos += 74;
  }
  return chunks.join("\r\n");
}

// Validazione UUID v4 (formato: 8-4-4-4-12 caratteri esadecimali)
function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // ─── 0. Verifica configurazione server ────────────────────────────────
    // Se manca la SERVICE_ROLE_KEY rifiutiamo esplicitamente: niente fallback
    // su anon_key, che maschererebbe un misconfig grave.
    if (!supabase) {
      return new NextResponse(
        "Servizio temporaneamente non disponibile. Riprova più tardi.",
        { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    // ─── 1. Estrai e valida il token ──────────────────────────────────────
    const token = req.nextUrl.searchParams.get("token");

    if (!token) {
      return new NextResponse(
        "Token mancante. URL atteso: /api/calendar.ics?token=<uuid-dello-studio>\nTrovi il tuo URL completo nelle Impostazioni → Google Calendar.",
        { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    if (!isValidUUID(token)) {
      // Non rivelare se il token è semplicemente malformato vs sconosciuto:
      // rispondi sempre 404 per evitare enumeration attack
      return new NextResponse("Calendario non trovato.", {
        status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    // ─── 2. Risolvi il token allo studio corrispondente ───────────────────
    const { data: studio, error: studioErr } = await supabase
      .from("studios")
      .select("id, name, address")
      .eq("calendar_feed_token", token)
      .maybeSingle();

    if (studioErr) {
      console.error("[calendar.ics] Errore lookup studio:", studioErr.message);
      return new NextResponse("Errore interno.", { status: 500 });
    }

    if (!studio) {
      // Token non corrisponde a nessuno studio
      return new NextResponse("Calendario non trovato.", {
        status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    const studioId = studio.id as string;

    // ─── 3. Carica appuntamenti SOLO di quello studio ─────────────────────
    const from = new Date();
    from.setDate(from.getDate() - 90);
    const to = new Date();
    to.setDate(to.getDate() + 365);

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("id, start_at, end_at, status, location, clinic_site, domicile_address, treatment_type, amount, calendar_note, patient_id")
      .eq("studio_id", studioId)               // ← FILTRO MULTI-TENANCY
      .gte("start_at", from.toISOString())
      .lte("start_at", to.toISOString())
      .neq("status", "cancelled")
      .order("start_at", { ascending: true });

    if (error) {
      console.error("[calendar.ics] Errore appointments:", error.message);
      return new NextResponse("Errore caricamento appuntamenti.", { status: 500 });
    }

    // ─── 4. Carica pazienti dello studio (separatamente per evitare RLS join) ─
    const patientIds = [...new Set((appointments || []).map(a => a.patient_id).filter(Boolean))];
    const patientsMap: Record<string, {first_name: string|null; last_name: string|null; phone: string|null}> = {};
    if (patientIds.length > 0) {
      const { data: pts } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone")
        .eq("studio_id", studioId)             // ← anche qui, doppio filtro
        .in("id", patientIds);
      (pts || []).forEach((p: { id: string; first_name: string|null; last_name: string|null; phone: string|null }) => {
        patientsMap[p.id] = { first_name: p.first_name, last_name: p.last_name, phone: p.phone };
      });
    }

    // ─── 5. Branding del calendario ───────────────────────────────────────
    const calName = studio.name || "FisioHub";
    const calDesc = `Agenda di ${studio.name || "FisioHub"}`;

    // ─── 6. Genera ICS ────────────────────────────────────────────────────
    // Colore "Basilico" (verde) impostato a livello calendario.
    // Google Calendar legge X-APPLE-CALENDAR-COLOR per il colore del calendario;
    // per i singoli eventi usa X-GOOGLE-COLOR-ID se vogliamo override.
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//FisioHub//Agenda//IT",
      `X-WR-CALNAME:${escapeICS(calName)}`,
      `X-WR-CALDESC:${escapeICS(calDesc)}`,
      "X-WR-TIMEZONE:Europe/Rome",
      // Colore "Basilico" — verde Google Calendar (#33B679)
      "X-APPLE-CALENDAR-COLOR:#33B679",
      "COLOR:33:182:121",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      // Timezone definition per ora legale/solare italiana
      "BEGIN:VTIMEZONE",
      "TZID:Europe/Rome",
      "BEGIN:DAYLIGHT",
      "DTSTART:19700329T020000",
      "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
      "TZOFFSETFROM:+0100",
      "TZOFFSETTO:+0200",
      "TZNAME:CEST",
      "END:DAYLIGHT",
      "BEGIN:STANDARD",
      "DTSTART:19701025T030000",
      "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0100",
      "TZNAME:CET",
      "END:STANDARD",
      "END:VTIMEZONE",
    ];

    for (const appt of appointments || []) {
      const patient = appt.patient_id ? patientsMap[appt.patient_id] : null;

      const patientName = patient
        ? `${patient.last_name || ""} ${patient.first_name || ""}`.trim()
        : "Paziente";

      const isDomicile = appt.location === "domicile";
      const summary = isDomicile
        ? `🏠 ${patientName}`
        : patientName;

      const treatLabel: Record<string, string> = {
        seduta: "Seduta", macchinario: "Macchinario", laser: "Laser",
        tecar: "Tecar", onde_urto: "Onde d'urto", tens: "TENS",
      };
      const treat = treatLabel[appt.treatment_type as string] || "Seduta";

      const location = isDomicile
        ? appt.domicile_address || "Domicilio"
        : appt.clinic_site || studio.address || "Studio";

      const descParts = [
        `Paziente: ${patientName}`,
        `Trattamento: ${treat}`,
        `Stato: ${{
          done: "Eseguito",
          confirmed: "Confermato",
          booked: "Prenotato",
          not_paid: "Non pagato",
        }[appt.status as string] || appt.status}`,
      ];
      if (appt.amount) descParts.push(`Importo: €${appt.amount}`);
      if (patient?.phone) descParts.push(`Tel: ${patient.phone}`);
      if (appt.calendar_note && !appt.calendar_note.startsWith("[WEB|")) {
        descParts.push(`Note: ${appt.calendar_note}`);
      }

      let endAt = appt.end_at;
      if (!endAt) {
        const startMs = new Date(appt.start_at).getTime();
        endAt = new Date(startMs + 60 * 60 * 1000).toISOString();
      }

      const uid = `${appt.id}@myfisiohub.app`;
      const dtstamp = toICSDate(new Date().toISOString());
      const dtstart = toICSDate(appt.start_at);
      const dtend = toICSDate(endAt);

      lines.push("BEGIN:VEVENT");
      lines.push(foldLine(`UID:${uid}`));
      lines.push(foldLine(`DTSTAMP:${dtstamp}Z`));
      lines.push(foldLine(`DTSTART;TZID=Europe/Rome:${dtstart}`));
      lines.push(foldLine(`DTEND;TZID=Europe/Rome:${dtend}`));
      lines.push(foldLine(`SUMMARY:${escapeICS(summary)}`));
      lines.push(foldLine(`LOCATION:${escapeICS(location)}`));
      lines.push(foldLine(`DESCRIPTION:${escapeICS(descParts.join("\\n"))}`));

      const colorMap: Record<string, string> = {
        done: "2",
        confirmed: "1",
        booked: "5",
        not_paid: "6",
      };
      const colorId = colorMap[appt.status as string];
      if (colorId) {
        lines.push(`X-GOOGLE-COLOR-ID:${colorId}`);
      }

      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    const icsContent = lines.join("\r\n") + "\r\n";

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="fisiohub.ics"`,
        // Cache: Google Calendar aggiorna ogni ~1-2h, non serve più spesso
        "Cache-Control": "public, max-age=3600",
        // CORS: permetti a Google di leggere il feed
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[calendar.ics] Errore:", msg);
    return new NextResponse("Errore generazione calendario.", { status: 500 });
  }
}
