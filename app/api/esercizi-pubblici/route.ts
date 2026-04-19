// app/api/esercizi-pubblici/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 12; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { patient_id, patient_name, esercizi, note } = body;

    if (!esercizi || !Array.isArray(esercizi)) {
      return NextResponse.json({ error: "esercizi required" }, { status: 400 });
    }

    // Check if updating existing token
    if (body.token) {
      const { error } = await supabaseAdmin
        .from("schede_esercizi_pubbliche")
        .update({ esercizi: JSON.stringify(esercizi), note: note ?? null })
        .eq("token", body.token);
      if (error) throw error;
      return NextResponse.json({ token: body.token, url: `/esercizi/${body.token}` });
    }

    const token = generateToken();
    const expires_at = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin.from("schede_esercizi_pubbliche").insert({
      token,
      patient_id: patient_id ?? null,
      patient_name: patient_name ?? "Paziente",
      esercizi: JSON.stringify(esercizi),
      note: note ?? null,
      expires_at,
    });

    if (error) {
      console.error("[esercizi-pubblici POST] insert error:", error.message, error.details);
      throw error;
    }

    return NextResponse.json({ token, url: `/esercizi/${token}` });
  } catch (e: any) {
    console.error("[esercizi-pubblici POST] exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

    console.log("[esercizi-pubblici GET] looking for token:", token);

    const { data, error } = await supabaseAdmin
      .from("schede_esercizi_pubbliche")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    console.log("[esercizi-pubblici GET] result:", data ? "found" : "not found", error?.message);

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Scheda non trovata o scaduta" }, { status: 404 });

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ error: "Questa scheda è scaduta" }, { status: 410 });
    }

    let esercizi = [];
    try {
      esercizi = JSON.parse(data.esercizi ?? "[]");
    } catch {
      esercizi = [];
    }

    return NextResponse.json({
      patient_name: data.patient_name,
      esercizi,
      note: data.note,
      created_at: data.created_at,
      expires_at: data.expires_at,
    });
  } catch (e: any) {
    console.error("[esercizi-pubblici GET] exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
