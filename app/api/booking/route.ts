// app/api/booking/route.ts
// POST /api/booking  — crea una richiesta di prenotazione pubblica
// Pubblico — nessun token richiesto

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface BookingPayload {
  service_name:     string;
  service_duration: number;   // minuti
  requested_date:   string;   // "YYYY-MM-DD"
  requested_time:   string;   // "HH:MM"
  patient_name:     string;
  patient_phone:    string;
  patient_email?:   string;
  notes?:           string;
}

export async function POST(req: NextRequest) {
  let body: BookingPayload;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  // Validazione campi obbligatori
  const required: (keyof BookingPayload)[] = [
    "service_name", "service_duration", "requested_date",
    "requested_time", "patient_name", "patient_phone",
  ];
  const missing = required.filter(k => !body[k]);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Campi mancanti: ${missing.join(", ")}` }, { status: 400 });
  }

  // Sanity check data: non nel passato
  const reqDate = new Date(`${body.requested_date}T${body.requested_time}:00`);
  if (isNaN(reqDate.getTime()) || reqDate < new Date()) {
    return NextResponse.json({ error: "Data/ora non valida o nel passato" }, { status: 400 });
  }

  // Controlla che lo slot sia ancora libero (race condition guard)
  const slotStart = `${body.requested_date}T${body.requested_time}:00`;
  const slotEndDt = new Date(reqDate.getTime() + body.service_duration * 60 * 1000);
  const slotEnd   = slotEndDt.toTimeString().slice(0, 5); // "HH:MM"

  // Cerca conflitti in appointments
  const { data: conflict1 } = await supabase
    .from("appointments")
    .select("id")
    .gte("start_at", `${body.requested_date}T00:00:00`)
    .lte("start_at", `${body.requested_date}T23:59:59`)
    .neq("status", "cancelled")
    .lt("start_at", `${body.requested_date}T${slotEnd}:00`)
    .limit(1);

  // Cerca conflitti in booking_requests
  const { data: conflict2 } = await supabase
    .from("booking_requests")
    .select("id")
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
  const { data, error } = await supabase
    .from("booking_requests")
    .insert({
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

  // (Opzionale) Notifica SMS via Twilio — decommentare quando configurato
  // await sendSmsConfirmation(body);

  return NextResponse.json({
    success: true,
    booking_id: data.id,
    message: `Prenotazione ricevuta per il ${body.requested_date} alle ${body.requested_time}. Ti confermeremo via SMS.`,
  });
}

// ── Placeholder notifica SMS (Twilio) ────────────────────────────────────────
// async function sendSmsConfirmation(b: BookingPayload) {
//   const client = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
//   await client.messages.create({
//     body: `Prenotazione ricevuta: ${b.service_name} il ${b.requested_date} alle ${b.requested_time}. Studio Dott. Turchetta, Via La Cupa 15 Pontecorvo. Per info: turchettamarco@gmail.com`,
//     from: process.env.TWILIO_PHONE_NUMBER,
//     to: b.patient_phone,
//   });
// }
