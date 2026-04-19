// app/api/confirm/route.ts
// GET: risolve token e mostra dati appuntamento
// POST: conferma l'appuntamento (status -> confirmed)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  // token format: apptId-encoded
  try {
    const appointmentId = Buffer.from(token, "base64url").toString("utf8");
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .select("id, start_at, status, location, clinic_site, domicile_address, patients(first_name,last_name)")
      .eq("id", appointmentId)
      .maybeSingle();

    if (error || !data) return NextResponse.json({ error: "Appuntamento non trovato" }, { status: 404 });
    return NextResponse.json({
      id: data.id,
      start_at: data.start_at,
      status: data.status,
      location: data.location,
      clinic_site: data.clinic_site,
      domicile_address: data.domicile_address,
      patient: Array.isArray(data.patients) ? data.patients[0] : data.patients,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Token non valido" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { token, action } = await req.json();
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

    const appointmentId = Buffer.from(token, "base64url").toString("utf8");
    const newStatus = action === "cancel" ? "cancelled" : "confirmed";

    const { error } = await supabaseAdmin
      .from("appointments")
      .update({ status: newStatus })
      .eq("id", appointmentId);

    if (error) throw error;
    return NextResponse.json({ ok: true, status: newStatus });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore" }, { status: 500 });
  }
}
