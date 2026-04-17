// app/api/calendar.ics/route.ts
// GET /api/calendar.ics
// Restituisce tutti gli appuntamenti confermati/prenotati/eseguiti
// in formato iCalendar (.ics) — compatibile con Google Calendar, Apple Calendar, Outlook
// L'URL va aggiunto una volta sola in Google Calendar come "Calendario da URL"

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  // Converte ISO 8601 → formato ICS con timezone Roma
  // Es: "2026-04-17T09:00:00" → "20260417T090000"
  return iso
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z?$/, "")
    .replace("T", "T")
    .slice(0, 15);
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

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    // Carica appuntamenti degli ultimi 90 giorni + prossimi 365
    const from = new Date();
    from.setDate(from.getDate() - 90);
    const to = new Date();
    to.setDate(to.getDate() + 365);

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select(`
        id, start_at, end_at, status, location, clinic_site,
        domicile_address, treatment_type, amount, calendar_note,
        patients:patient_id (first_name, last_name, phone)
      `)
      .gte("start_at", from.toISOString())
      .lte("start_at", to.toISOString())
      .neq("status", "cancelled")
      .order("start_at", { ascending: true });

    if (error) throw error;

    // Carica nome studio per il calendario
    const { data: settings } = await supabase
      .from("practice_settings")
      .select("practice_name, owner_full_name, address")
      .limit(1)
      .maybeSingle();

    const calName = settings?.practice_name || "FisioHub";
    const calDesc = settings?.owner_full_name
      ? `Agenda di ${settings.owner_full_name}`
      : "Agenda fisioterapia";

    // ── Genera ICS ───────────────────────────────────────────────────────────
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//FisioHub//Agenda//IT",
      `X-WR-CALNAME:${escapeICS(calName)}`,
      `X-WR-CALDESC:${escapeICS(calDesc)}`,
      "X-WR-TIMEZONE:Europe/Rome",
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
      const patient = Array.isArray(appt.patients)
        ? appt.patients[0]
        : (appt.patients as any);

      const patientName = patient
        ? `${patient.last_name || ""} ${patient.first_name || ""}`.trim()
        : "Paziente";

      // Titolo evento
      const treatLabel: Record<string, string> = {
        seduta: "Seduta",
        macchinario: "Macchinario",
        laser: "Laser",
        tecar: "Tecar",
        onde_urto: "Onde d'urto",
        tens: "TENS",
      };
      const treat = treatLabel[appt.treatment_type as string] || "Seduta";
      const isDomicile = appt.location === "domicile";
      const summary = isDomicile
        ? `🏠 ${patientName} — ${treat}`
        : `${patientName} — ${treat}`;

      // Location
      const location = isDomicile
        ? appt.domicile_address || "Domicilio"
        : appt.clinic_site || "Studio";

      // Descrizione
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

      // End time: se manca end_at usa start + 1h
      let endAt = appt.end_at;
      if (!endAt) {
        const startMs = new Date(appt.start_at).getTime();
        endAt = new Date(startMs + 60 * 60 * 1000).toISOString();
      }

      // UID univoco basato sull'ID appuntamento
      const uid = `${appt.id}@fisiohub.app`;

      // Timestamp di creazione (ora corrente come fallback)
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

      // Colore Google Calendar basato sullo stato
      const colorMap: Record<string, string> = {
        done: "2",      // verde salvia
        confirmed: "1", // lavanda
        booked: "5",    // banana
        not_paid: "6",  // mandarino
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
        "Content-Disposition": 'attachment; filename="fisiohub.ics"',
        // Cache: Google Calendar aggiorna ogni ~1-2h, non serve più spesso
        "Cache-Control": "public, max-age=3600",
        // CORS: permetti a Google di leggere il feed
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    console.error("[calendar.ics] Error:", err?.message);
    return new NextResponse("Error generating calendar feed", { status: 500 });
  }
}
