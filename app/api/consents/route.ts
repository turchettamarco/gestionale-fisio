// app/api/consents/route.ts
// API pubblica per i consensi a distanza.
//
// GET  ?token=...   → risolve token → testo consenso + branding studio
// POST { token, signed_name, signature_data, accepted } → registra la firma
//
// SICUREZZA (stesso pattern di /api/confirm):
// - Service role SOLO server-side, nessun fallback ad anon key
// - Token 48 hex random generati dal DB (pgcrypto)
// - La firma è accettata solo se status='pending'
// - IP e user-agent salvati come evidenza

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Configurazione mancante: SUPABASE_SERVICE_ROLE_KEY richiesta");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// GET: risolve token → consenso + branding
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || !/^[a-f0-9]{48}$/.test(token)) {
    return NextResponse.json({ error: "Token non valido" }, { status: 400 });
  }

  try {
    const db = getAdmin();

    const { data: consent, error } = await db
      .from("patient_consents")
      .select("id, studio_id, consent_type, title, body_text, status, signed_at, signed_name, sent_at")
      .eq("access_token", token)
      .maybeSingle();

    if (error) {
      console.error("[consents GET] lookup error:", error.message);
      return NextResponse.json({ error: "Errore database" }, { status: 500 });
    }
    if (!consent) {
      return NextResponse.json({ error: "Link non valido" }, { status: 404 });
    }

    let studio = null;
    if (consent.studio_id) {
      const studioRes = await db
        .from("studios")
        .select("name, address, phone, signature_name, signature_title, multi_operator_enabled, logo_base64")
        .eq("id", consent.studio_id)
        .maybeSingle();
      studio = studioRes.data || null;
    }

    return NextResponse.json({
      consent_type: consent.consent_type,
      title: consent.title,
      body_text: consent.body_text,
      status: consent.status,
      signed_at: consent.signed_at,
      signed_name: consent.signed_name,
      sent_at: consent.sent_at,
      studio,
    });
  } catch (e) {
    console.error("[consents GET] error:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// POST: registra la firma
export async function POST(req: NextRequest) {
  let body: {
    token?: string;
    signed_name?: string;
    signature_data?: string;
    accepted?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const token = body.token ?? "";
  if (!/^[a-f0-9]{48}$/.test(token)) {
    return NextResponse.json({ error: "Token non valido" }, { status: 400 });
  }
  if (body.accepted !== true) {
    return NextResponse.json(
      { error: "È necessario confermare la presa visione" },
      { status: 400 }
    );
  }
  const signedName = (body.signed_name ?? "").trim();
  if (signedName.length < 5 || !signedName.includes(" ")) {
    return NextResponse.json(
      { error: "Inserisci nome e cognome completi" },
      { status: 400 }
    );
  }
  const signatureData = body.signature_data ?? "";
  if (!signatureData.startsWith("data:image/png;base64,") || signatureData.length < 200) {
    return NextResponse.json({ error: "Firma mancante" }, { status: 400 });
  }
  if (signatureData.length > 500_000) {
    return NextResponse.json({ error: "Firma troppo grande" }, { status: 413 });
  }

  try {
    const db = getAdmin();

    const { data: consent, error: lookErr } = await db
      .from("patient_consents")
      .select("id, status")
      .eq("access_token", token)
      .maybeSingle();

    if (lookErr) {
      console.error("[consents POST] lookup error:", lookErr.message);
      return NextResponse.json({ error: "Errore database" }, { status: 500 });
    }
    if (!consent) {
      return NextResponse.json({ error: "Link non valido" }, { status: 404 });
    }
    if (consent.status === "signed") {
      return NextResponse.json({ error: "Consenso già firmato" }, { status: 409 });
    }
    if (consent.status === "revoked") {
      return NextResponse.json({ error: "Questo link non è più attivo" }, { status: 410 });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;
    const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;

    // Update condizionato su status=pending: previene doppia firma
    // anche in caso di richieste concorrenti.
    const { data: updated, error: updErr } = await db
      .from("patient_consents")
      .update({
        status: "signed",
        signed_at: new Date().toISOString(),
        signed_name: signedName,
        signature_data: signatureData,
        signer_ip: ip,
        signer_user_agent: ua,
      })
      .eq("id", consent.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updErr) {
      console.error("[consents POST] update error:", updErr.message);
      return NextResponse.json({ error: "Errore salvataggio firma" }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: "Consenso già firmato" }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[consents POST] error:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
