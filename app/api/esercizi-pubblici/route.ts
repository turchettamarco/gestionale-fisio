// app/api/esercizi-pubblici/route.ts
// POST: salva una scheda esercizi e restituisce il token pubblico
// GET: recupera una scheda tramite token (pubblica, no auth)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

// POST /api/esercizi-pubblici — salva scheda e ritorna token
export async function POST(req: NextRequest) {
  try {
    const { patient_id, patient_name, esercizi, note } = await req.json();
    if (!esercizi || !Array.isArray(esercizi)) {
      return NextResponse.json({ error: "esercizi required" }, { status: 400 });
    }

    const token = generateToken();
    const expires_at = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 giorni

    const { error } = await supabaseAdmin.from("schede_esercizi_pubbliche").insert({
      token,
      patient_id: patient_id ?? null,
      patient_name: patient_name ?? "Paziente",
      esercizi: JSON.stringify(esercizi),
      note: note ?? null,
      expires_at,
    });

    if (error) throw error;

    return NextResponse.json({ token, url: `/esercizi/${token}` });
  } catch (e: any) {
    console.error("[esercizi-pubblici POST]", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}

// GET /api/esercizi-pubblici?token=xxx — recupera scheda pubblica
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

    const { data, error } = await supabaseAnon
      .from("schede_esercizi_pubbliche")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Scheda non trovata o scaduta" }, { status: 404 });

    // Controlla scadenza
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ error: "Questa scheda è scaduta" }, { status: 410 });
    }

    return NextResponse.json({
      patient_name: data.patient_name,
      esercizi: JSON.parse(data.esercizi ?? "[]"),
      note: data.note,
      created_at: data.created_at,
      expires_at: data.expires_at,
    });
  } catch (e: any) {
    console.error("[esercizi-pubblici GET]", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
