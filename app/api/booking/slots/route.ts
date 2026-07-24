// app/api/booking/slots/route.ts
// GET /api/booking/slots?studio_id=<uuid>&date=2026-03-23&duration=45
// Restituisce gli slot liberi per uno studio, una data e una durata (minuti)
// Pubblico — nessun token richiesto, MA studio_id è obbligatorio (mig. 083).
//
// Due correzioni rispetto alla versione precedente:
//  1. Multi-tenancy: ogni query filtra per studio_id. Prima non lo faceva
//     e con 2+ studi mischiava gli orari (o andava in errore su .single()).
//  2. Fuso orario: gli orari italiani si ricavano con src/lib/booking/time,
//     non con getHours() sul fuso del server (UTC su Vercel), che sfalsava
//     la disponibilità di 1-2 ore.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabaseServer";
import {
  romeLocalToUtcISO,
  romeMinutesOfDay,
  romeDayOfWeek,
  minutesToTime,
  timeToMinutes,
} from "@/src/lib/booking/time";

const SLOT_INTERVAL = 30; // minuti tra ogni slot proposto
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studioId   = searchParams.get("studio_id");
  const locationId = searchParams.get("location_id"); // opzionale (mig. 084)
  const date       = searchParams.get("date");     // "2026-03-23"
  const duration   = Number(searchParams.get("duration") ?? 45);

  if (!studioId || !date || !DATE_RE.test(date) || isNaN(duration) || duration <= 0) {
    return NextResponse.json(
      { error: "Parametri mancanti o non validi: servono studio_id, date (YYYY-MM-DD) e duration" },
      { status: 400 }
    );
  }

  // 0️⃣  Lo studio esiste?
  const { data: studio, error: studioErr } = await supabaseAdmin
    .from("studios")
    .select("id")
    .eq("id", studioId)
    .maybeSingle();

  if (studioErr) {
    console.error("[booking/slots] studio query error:", studioErr);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
  if (!studio) {
    return NextResponse.json({ error: "Studio non trovato" }, { status: 404 });
  }

  // Se è indicata una sede, deve appartenere a QUESTO studio: altrimenti
  // si potrebbero sondare gli orari di una sede altrui passando un id a caso.
  if (locationId) {
    const { data: loc } = await supabaseAdmin
      .from("studio_locations")
      .select("id")
      .eq("id", locationId)
      .eq("studio_id", studioId)
      .maybeSingle();
    if (!loc) {
      return NextResponse.json({ error: "Sede non valida" }, { status: 400 });
    }
  }

  // 1️⃣  Orario di apertura del giorno.
  //
  //     Modello della mig. 077, con la stessa semantica del form in
  //     Impostazioni: una sede o ha i propri orari (il form ne salva
  //     sempre tutti e 7 i giorni, anche quelli chiusi) oppure non ne ha
  //     nessuno e allora eredita quelli dello studio.
  //
  //     Il fallback è quindi PER SEDE, non per giorno: se la sede ha
  //     orari propri e manca la riga di quel giorno, la sede è chiusa —
  //     non si torna all'orario di studio, altrimenti si proporrebbero
  //     slot in una sede chiusa (esattamente il caso Cassino aperto solo
  //     martedì e giovedì descritto nella 077).
  const dayOfWeek = romeDayOfWeek(date);

  type WorkingHourRow = {
    day_of_week: number; open_time: string; close_time: string; is_open: boolean;
  };

  let wh: WorkingHourRow | null = null;
  let locationHasOwnHours = false;

  if (locationId) {
    const { data: locRows, error } = await supabaseAdmin
      .from("working_hours")
      .select("day_of_week, open_time, close_time, is_open")
      .eq("studio_id", studioId)
      .eq("location_id", locationId);

    if (error) {
      console.error("[booking/slots] working_hours (sede) query error:", error);
      return NextResponse.json({ error: "Errore server" }, { status: 500 });
    }

    if (locRows && locRows.length > 0) {
      locationHasOwnHours = true;
      wh = (locRows as WorkingHourRow[]).find(r => r.day_of_week === dayOfWeek) ?? null;
    }
  }

  if (!locationHasOwnHours) {
    const { data, error } = await supabaseAdmin
      .from("working_hours")
      .select("day_of_week, open_time, close_time, is_open")
      .eq("studio_id", studioId)
      .is("location_id", null)
      .eq("day_of_week", dayOfWeek)
      .maybeSingle();

    if (error) {
      console.error("[booking/slots] working_hours (studio) query error:", error);
      return NextResponse.json({ error: "Errore server" }, { status: 500 });
    }
    wh = data as WorkingHourRow | null;
  }

  if (!wh || !wh.is_open) {
    return NextResponse.json({ slots: [], closed: true });
  }

  const openMin  = timeToMinutes(wh.open_time);
  const closeMin = timeToMinutes(wh.close_time);

  // 2️⃣  Chiusura straordinaria (ferie, festivi) in quella data?
  const { data: blocked } = await supabaseAdmin
    .from("blocked_days")
    .select("id")
    .eq("studio_id", studioId)
    .eq("date", date)
    .limit(1);

  if (blocked && blocked.length > 0) {
    return NextResponse.json({ slots: [], closed: true });
  }

  // 3️⃣  Appuntamenti già in agenda quel giorno, per QUESTO studio.
  //     I confini della giornata sono istanti UTC calcolati sull'ora
  //     italiana, non stringhe naive.
  //
  //     Filtro sede: si considerano occupati gli appuntamenti di quella
  //     sede E quelli senza sede (location_id NULL). Questi ultimi sono
  //     appuntamenti storici o non assegnati: non sappiamo dove siano,
  //     quindi bloccano ovunque. Meglio proporre uno slot in meno che
  //     far arrivare due pazienti insieme.
  const dayStartUtc = romeLocalToUtcISO(date, "00:00");
  const dayEndUtc   = romeLocalToUtcISO(date, "23:59");

  let apptQuery = supabaseAdmin
    .from("appointments")
    .select("start_at, end_at")
    .eq("studio_id", studioId)
    .gte("start_at", dayStartUtc)
    .lte("start_at", dayEndUtc)
    .neq("status", "cancelled");

  if (locationId) {
    apptQuery = apptQuery.or(`location_id.eq.${locationId},location_id.is.null`);
  }

  const { data: appts } = await apptQuery;

  // 4️⃣  Richieste pubbliche già in attesa/confermate, per QUESTO studio
  let reqQuery = supabaseAdmin
    .from("booking_requests")
    .select("requested_time, service_duration")
    .eq("studio_id", studioId)
    .eq("requested_date", date)
    .in("status", ["pending", "confirmed"]);

  if (locationId) {
    reqQuery = reqQuery.or(`location_id.eq.${locationId},location_id.is.null`);
  }

  const { data: reqs } = await reqQuery;

  // 5️⃣  Intervalli occupati, in minuti di giornata italiana
  const busy: Array<[number, number]> = [];

  for (const a of appts ?? []) {
    busy.push([romeMinutesOfDay(a.start_at), romeMinutesOfDay(a.end_at)]);
  }

  for (const r of reqs ?? []) {
    const startMin = timeToMinutes(r.requested_time as string);
    busy.push([startMin, startMin + Number(r.service_duration)]);
  }

  // 6️⃣  Slot liberi. Se la data è oggi, si scartano quelli già passati.
  const nowMin = date === new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" })
    ? romeMinutesOfDay(new Date())
    : -1;

  const slots: string[] = [];
  for (let t = openMin; t + duration <= closeMin; t += SLOT_INTERVAL) {
    if (t <= nowMin) continue;
    const slotEnd = t + duration;
    const isFree = !busy.some(([bs, be]) => t < be && slotEnd > bs);
    if (isFree) slots.push(minutesToTime(t));
  }

  return NextResponse.json(
    { slots, date, duration },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
