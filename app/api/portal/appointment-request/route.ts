// app/api/portal/appointment-request/route.ts
// ════════════════════════════════════════════════════════════════════════
// POST — il paziente chiede di disdire o spostare un appuntamento (mig. 094)
//
// Body: { token, appointment_id, kind: "cancel" | "reschedule", message? }
//
// L'AGENDA NON VIENE TOCCATA. Si registra una richiesta in stato pending e
// si crea una notifica per lo studio: sarà il terapista a decidere. Una
// disdetta automatica lascerebbe buchi che nessuno ha visto in tempo e
// aggirerebbe le regole dello studio sui preavvisi.
//
// SICUREZZA: il token identifica il paziente; si verifica che
// l'appuntamento sia davvero suo prima di registrare qualsiasi cosa.
// ════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body?.token ?? "").trim();
    const appointmentId = String(body?.appointment_id ?? "").trim();
    const kind = String(body?.kind ?? "").trim();
    const message = typeof body?.message === "string"
      ? body.message.trim().slice(0, 500) : null;

    if (!token || !appointmentId || (kind !== "cancel" && kind !== "reschedule")) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    const db = getAdmin();

    const { data: tk } = await db
      .from("patient_portal_tokens")
      .select("patient_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!tk?.patient_id) {
      return NextResponse.json({ error: "Link non valido" }, { status: 404 });
    }
    if (tk.expires_at && new Date(tk.expires_at) < new Date()) {
      return NextResponse.json({ error: "Link scaduto" }, { status: 410 });
    }

    // L'appuntamento è davvero di questo paziente?
    const { data: appt } = await db
      .from("appointments")
      .select("id, studio_id, patient_id, start_at, status")
      .eq("id", appointmentId)
      .maybeSingle();

    if (!appt || appt.patient_id !== tk.patient_id) {
      return NextResponse.json({ error: "Appuntamento non trovato" }, { status: 404 });
    }
    if (appt.status === "cancelled") {
      return NextResponse.json({ error: "Appuntamento già annullato" }, { status: 409 });
    }

    // La funzione è attiva per questo studio?
    const { data: studio } = await db
      .from("studios")
      .select("portal_allow_changes")
      .eq("id", appt.studio_id)
      .maybeSingle();

    if (studio?.portal_allow_changes !== true) {
      return NextResponse.json({ error: "Funzione non attiva" }, { status: 403 });
    }

    // Richiesta già in coda per lo stesso appuntamento?
    const { data: existing } = await db
      .from("appointment_change_requests")
      .select("id")
      .eq("appointment_id", appointmentId)
      .eq("status", "pending")
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "Hai già inviato una richiesta per questo appuntamento" },
        { status: 409 }
      );
    }

    const { error } = await db.from("appointment_change_requests").insert({
      studio_id: appt.studio_id,
      patient_id: tk.patient_id,
      appointment_id: appointmentId,
      kind,
      message,
    });

    if (error) {
      console.error("[portal/appointment-request] insert error:", error.message);
      return NextResponse.json({ error: "Errore invio richiesta" }, { status: 500 });
    }

    // Notifica allo studio: la richiesta non serve a nulla se nessuno la vede
    try {
      const { data: patient } = await db
        .from("patients")
        .select("first_name, last_name")
        .eq("id", tk.patient_id)
        .maybeSingle();

      await db.from("notifications").insert({
        studio_id: appt.studio_id,
        type: "change_request",
        appointment_id: appointmentId,
        patient_id: tk.patient_id,
        payload: {
          kind,
          message,
          patient_name: [patient?.first_name, patient?.last_name].filter(Boolean).join(" "),
          start_at: appt.start_at,
        },
      });
    } catch (notifyErr) {
      console.warn("[portal/appointment-request] notifica non creata:", notifyErr);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[portal/appointment-request] exception:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
