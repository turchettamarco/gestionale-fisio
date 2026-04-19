// app/api/portal/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Usa SEMPRE service role — bypassa RLS completamente
function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  try {
    const db = getAdmin();
    const { data: tk, error: tkErr } = await db
      .from("patient_portal_tokens")
      .select("patient_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (tkErr) {
      console.error("[portal GET] token error:", tkErr.message, tkErr.code);
      return NextResponse.json({ error: "Errore database: " + tkErr.message }, { status: 500 });
    }
    if (!tk) return NextResponse.json({ error: "Link non valido o scaduto" }, { status: 404 });
    if (tk.expires_at && new Date(tk.expires_at) < new Date()) {
      return NextResponse.json({ error: "Link scaduto — chiedi un nuovo link allo studio" }, { status: 410 });
    }

    const [patientRes, apptRes, exercisesRes] = await Promise.all([
      db.from("patients").select("first_name,last_name").eq("id", tk.patient_id).maybeSingle(),
      db.from("appointments")
        .select("id,start_at,end_at,status,location,clinic_site,domicile_address,treatment_type")
        .eq("patient_id", tk.patient_id)
        .gte("start_at", new Date().toISOString())
        .neq("status","cancelled")
        .order("start_at", { ascending: true })
        .limit(10),
      db.from("schede_esercizi_pubbliche")
        .select("token,created_at")
        .eq("patient_id", tk.patient_id)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    return NextResponse.json({
      patient: patientRes.data,
      upcoming: apptRes.data || [],
      exercise_token: exercisesRes.data?.[0]?.token || null,
    });
  } catch (e: any) {
    console.error("[portal GET] exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { patient_id } = await req.json();
    if (!patient_id) return NextResponse.json({ error: "patient_id required" }, { status: 400 });

    const db = getAdmin();
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let token = ""; for (let i=0;i<14;i++) token += chars[Math.floor(Math.random()*chars.length)];
    const expires_at = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await db.from("patient_portal_tokens").insert({ token, patient_id, expires_at });
    if (error) {
      console.error("[portal POST] insert error:", error.message, "code:", error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ token, url: `/portale/${token}` });
  } catch (e: any) {
    console.error("[portal POST] exception:", e?.message);
    // If env var missing, show clear message
    if (e?.message?.includes("env vars missing")) {
      return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY non configurata su Vercel. Aggiungila in Settings → Environment Variables." }, { status: 500 });
    }
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
