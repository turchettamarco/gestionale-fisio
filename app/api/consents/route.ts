// app/api/consents/route.ts
// API pubblica per i consensi a distanza con verifica identità.
//
// GET  ?token=...
//   → meta documenti (senza testo) + branding + verification_required.
//     Se il paziente non ha birth_date in anagrafica i documenti completi
//     vengono restituiti subito (verifica impossibile, flusso invariato).
//
// POST { action: "verify", token, birth_date }
//   → confronta con patients.birth_date. OK → documenti completi.
//     KO → incrementa verify_attempts; oltre MAX_ATTEMPTS il link si blocca.
//
// POST { action: "sign", token, birth_date?, signed_name, signature_data,
//      accepted_ids }
//   → firma in un'unica volta i documenti accettati. Se la verifica è
//     richiesta, birth_date viene ri-controllata (stateless, nessuna
//     sessione da mantenere).
//
// SICUREZZA:
// - Service role SOLO server-side, nessun fallback ad anon key
// - Token 48 hex; la firma è accettata solo su righe status='pending'
// - Anti brute-force sulla data di nascita (MAX_ATTEMPTS = 10)
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

const TOKEN_RE = /^[a-f0-9]{48}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ATTEMPTS = 10;

type ConsentDbRow = {
  id: string;
  studio_id: string;
  patient_id: string;
  consent_type: string;
  title: string;
  body_text: string;
  status: string;
  signed_at: string | null;
  signed_name: string | null;
  sent_at: string;
  verify_attempts: number;
};

type Admin = ReturnType<typeof getAdmin>;

async function findByToken(db: Admin, token: string) {
  const { data, error } = await db
    .from("patient_consents")
    .select("id, studio_id, patient_id, consent_type, title, body_text, status, signed_at, signed_name, sent_at, verify_attempts")
    .or(`access_token.eq.${token},bundle_token.eq.${token}`)
    .order("sent_at", { ascending: true });
  return { docs: (data ?? []) as ConsentDbRow[], error };
}

async function getPatientBirthDate(db: Admin, patientId: string): Promise<string | null> {
  const { data } = await db
    .from("patients")
    .select("birth_date")
    .eq("id", patientId)
    .maybeSingle();
  return (data?.birth_date as string | null) ?? null;
}

async function getStudio(db: Admin, studioId: string) {
  const { data } = await db
    .from("studios")
    .select("name, address, phone, signature_name, signature_title, multi_operator_enabled")
    .eq("id", studioId)
    .maybeSingle();
  return data || null;
}

function isLocked(docs: ConsentDbRow[]): boolean {
  return docs.some(d => (d.verify_attempts ?? 0) >= MAX_ATTEMPTS);
}

function fullDocuments(docs: ConsentDbRow[]) {
  return docs.map(d => ({
    id: d.id,
    consent_type: d.consent_type,
    title: d.title,
    body_text: d.body_text,
    status: d.status,
    signed_at: d.signed_at,
    signed_name: d.signed_name,
    sent_at: d.sent_at,
  }));
}

// GET: meta + verification flag (testi solo se verifica non richiesta)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Token non valido" }, { status: 400 });
  }

  try {
    const db = getAdmin();
    const { docs, error } = await findByToken(db, token);

    if (error) {
      console.error("[consents GET] lookup error:", error.message);
      return NextResponse.json({ error: "Errore database" }, { status: 500 });
    }
    if (docs.length === 0) {
      return NextResponse.json({ error: "Link non valido" }, { status: 404 });
    }
    if (isLocked(docs)) {
      return NextResponse.json(
        { error: "Link bloccato per troppi tentativi. Contatta lo studio per un nuovo link." },
        { status: 429 }
      );
    }

    const studio = await getStudio(db, docs[0].studio_id);
    const birthDate = await getPatientBirthDate(db, docs[0].patient_id);
    const verificationRequired = birthDate !== null;

    if (!verificationRequired) {
      return NextResponse.json({
        verification_required: false,
        documents: fullDocuments(docs),
        studio,
      });
    }

    // Verifica richiesta: NIENTE testi né dati personali, solo meta
    return NextResponse.json({
      verification_required: true,
      documents_meta: docs.map(d => ({
        id: d.id,
        consent_type: d.consent_type,
        title: d.title,
        status: d.status,
      })),
      studio,
    });
  } catch (e) {
    console.error("[consents GET] error:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}

// Verifica birth_date; gestisce contatore tentativi.
// Ritorna: "ok" | "wrong" | "locked"
async function checkBirthDate(
  db: Admin,
  docs: ConsentDbRow[],
  submitted: string
): Promise<"ok" | "wrong" | "locked"> {
  if (isLocked(docs)) return "locked";

  const expected = await getPatientBirthDate(db, docs[0].patient_id);
  if (expected === null) return "ok"; // anagrafica senza data: verifica non applicabile

  if (DATE_RE.test(submitted) && submitted === expected) {
    await db
      .from("patient_consents")
      .update({ verify_attempts: 0, verified_at: new Date().toISOString() })
      .in("id", docs.map(d => d.id));
    return "ok";
  }

  const newAttempts = Math.max(...docs.map(d => d.verify_attempts ?? 0)) + 1;
  await db
    .from("patient_consents")
    .update({ verify_attempts: newAttempts })
    .in("id", docs.map(d => d.id));
  return newAttempts >= MAX_ATTEMPTS ? "locked" : "wrong";
}

// POST: action = "verify" | "sign"
export async function POST(req: NextRequest) {
  let body: {
    action?: string;
    token?: string;
    birth_date?: string;
    signed_name?: string;
    signature_data?: string;
    accepted_ids?: string[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const token = body.token ?? "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Token non valido" }, { status: 400 });
  }
  const action = body.action === "verify" ? "verify" : "sign";

  try {
    const db = getAdmin();
    const { docs, error: lookErr } = await findByToken(db, token);

    if (lookErr) {
      console.error("[consents POST] lookup error:", lookErr.message);
      return NextResponse.json({ error: "Errore database" }, { status: 500 });
    }
    if (docs.length === 0) {
      return NextResponse.json({ error: "Link non valido" }, { status: 404 });
    }

    // ── VERIFY ──────────────────────────────────────────────────────────
    if (action === "verify") {
      const check = await checkBirthDate(db, docs, body.birth_date ?? "");
      if (check === "locked") {
        return NextResponse.json(
          { error: "Link bloccato per troppi tentativi. Contatta lo studio per un nuovo link." },
          { status: 429 }
        );
      }
      if (check === "wrong") {
        return NextResponse.json(
          { error: "Data di nascita non corretta. Riprova." },
          { status: 403 }
        );
      }
      return NextResponse.json({ documents: fullDocuments(docs) });
    }

    // ── SIGN ────────────────────────────────────────────────────────────
    const acceptedIds = Array.isArray(body.accepted_ids) ? body.accepted_ids : [];
    if (acceptedIds.length === 0) {
      return NextResponse.json(
        { error: "Spunta la presa visione di almeno un documento" },
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

    // Ri-verifica stateless della data di nascita (se applicabile)
    const check = await checkBirthDate(db, docs, body.birth_date ?? "");
    if (check === "locked") {
      return NextResponse.json(
        { error: "Link bloccato per troppi tentativi. Contatta lo studio per un nuovo link." },
        { status: 429 }
      );
    }
    if (check === "wrong") {
      return NextResponse.json(
        { error: "Verifica identità non superata." },
        { status: 403 }
      );
    }

    // Firmabili: solo righe pending del bundle accettate dal paziente.
    const signableIds = docs
      .filter(d => d.status === "pending" && acceptedIds.includes(d.id))
      .map(d => d.id);

    if (signableIds.length === 0) {
      const allSigned = docs.every(d => d.status === "signed");
      if (allSigned) {
        return NextResponse.json({ error: "Consensi già firmati" }, { status: 409 });
      }
      return NextResponse.json({ error: "Nessun documento firmabile" }, { status: 410 });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;
    const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;

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
      .in("id", signableIds)
      .eq("status", "pending")
      .select("id");

    if (updErr) {
      console.error("[consents POST] update error:", updErr.message);
      return NextResponse.json({ error: "Errore salvataggio firma" }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: "Consensi già firmati" }, { status: 409 });
    }

    return NextResponse.json({ ok: true, signed_count: updated.length });
  } catch (e) {
    console.error("[consents POST] error:", e);
    return NextResponse.json({ error: "Errore server" }, { status: 500 });
  }
}
