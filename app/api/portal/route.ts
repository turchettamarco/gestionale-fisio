// app/api/portal/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET: recupera dati del paziente via token
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  try {
    // Resolve token -> patient_id
    const { data: tk } = await supabaseAdmin.from("patient_portal_tokens")
      .select("patient_id, expires_at").eq("token", token).maybeSingle();
    if (!tk) return NextResponse.json({ error: "Link non valido o scaduto" }, { status: 404 });
    if (tk.expires_at && new Date(tk.expires_at) < new Date()) {
      return NextResponse.json({ error: "Link scaduto" }, { status: 410 });
    }

    // Get patient + appointments (future) + exercises + soap notes (only quick_note for privacy)
    const [patientRes, apptRes, exercisesRes] = await Promise.all([
      supabaseAdmin.from("patients").select("first_name,last_name").eq("id", tk.patient_id).maybeSingle(),
      supabaseAdmin.from("appointments").select("id,start_at,end_at,status,location,clinic_site,domicile_address,treatment_type")
        .eq("patient_id", tk.patient_id).gte("start_at", new Date().toISOString())
        .neq("status","cancelled").order("start_at", { ascending: true }).limit(10),
      supabaseAdmin.from("schede_esercizi_pubbliche").select("token,created_at")
        .eq("patient_id", tk.patient_id).order("created_at", { ascending: false }).limit(1),
    ]);

    return NextResponse.json({
      patient: patientRes.data,
      upcoming: apptRes.data || [],
      exercise_token: exercisesRes.data?.[0]?.token || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}

// POST: genera un nuovo token per un paziente
export async function POST(req: NextRequest) {
  try {
    const { patient_id } = await req.json();
    if (!patient_id) return NextResponse.json({ error: "patient_id required" }, { status: 400 });

    // Genera token
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let token = ""; for (let i=0;i<14;i++) token += chars[Math.floor(Math.random()*chars.length)];
    const expires_at = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(); // 180gg

    await supabaseAdmin.from("patient_portal_tokens").insert({ token, patient_id, expires_at });
    return NextResponse.json({ token, url: `/portale/${token}` });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
