// app/api/booking/slots/route.ts
// GET /api/booking/slots?date=2026-03-23&duration=45
// Restituisce gli slot liberi per una data e una durata (minuti)
// Pubblico — nessun token richiesto

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Client con anon key — lettura pubblica, RLS attivo
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SLOT_INTERVAL = 30; // minuti tra ogni slot disponibile

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minToTime(m: number): string {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const min = (m % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date     = searchParams.get("date");     // "2026-03-23"
  const duration = Number(searchParams.get("duration") ?? 45);

  if (!date || isNaN(duration) || duration <= 0) {
    return NextResponse.json({ error: "Parametri mancanti: date e duration richiesti" }, { status: 400 });
  }

  // 1️⃣  Orario di apertura per il giorno della settimana
  const dayOfWeek = new Date(date).getDay(); // 0=Dom … 6=Sab
  const { data: wh, error: whErr } = await supabase
    .from("working_hours")
    .select("open_time, close_time, is_open")
    .eq("day_of_week", dayOfWeek)
    .single();

  if (whErr || !wh || !wh.is_open) {
    return NextResponse.json({ slots: [], closed: true });
  }

  const openMin  = timeToMin(wh.open_time);
  const closeMin = timeToMin(wh.close_time);

  // 2️⃣  Appuntamenti già esistenti in quella data (pazienti registrati)
  const { data: appts } = await supabase
    .from("appointments")
    .select("start_at, end_at")
    .gte("start_at", `${date}T00:00:00`)
    .lte("start_at", `${date}T23:59:59`)
    .neq("status", "cancelled");

  // 3️⃣  Richieste di prenotazione pubblica in attesa/confermate
  const { data: reqs } = await supabase
    .from("booking_requests")
    .select("requested_time, service_duration")
    .eq("requested_date", date)
    .in("status", ["pending", "confirmed"]);

  // 4️⃣  Costruisce lista slot occupati come [startMin, endMin]
  const busy: Array<[number, number]> = [];

  for (const a of appts ?? []) {
    const s = new Date(a.start_at);
    const e = new Date(a.end_at);
    const startMin = s.getHours() * 60 + s.getMinutes();
    const endMin   = e.getHours() * 60 + e.getMinutes();
    busy.push([startMin, endMin]);
  }

  for (const r of reqs ?? []) {
    const [rh, rm] = (r.requested_time as string).split(":").map(Number);
    const startMin = rh * 60 + rm;
    const endMin   = startMin + (r.service_duration as number);
    busy.push([startMin, endMin]);
  }

  // 5️⃣  Genera tutti gli slot possibili e filtra quelli liberi
  const slots: string[] = [];
  for (let t = openMin; t + duration <= closeMin; t += SLOT_INTERVAL) {
    const slotEnd = t + duration;
    const isFree  = !busy.some(([bs, be]) => t < be && slotEnd > bs);
    if (isFree) slots.push(minToTime(t));
  }

  return NextResponse.json({ slots, date, duration });
}
