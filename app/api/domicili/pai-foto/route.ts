// ═══════════════════════════════════════════════════════════════════════
// app/api/domicili/pai-foto/route.ts
// ═══════════════════════════════════════════════════════════════════════
//
// "PAI da foto" — sezione Domicili Cooperative.
//
// Riceve la foto del Modulo PAI Operatori (compressa lato client, come
// per Seduta da foto) e restituisce i campi del modulo in JSON:
// date PAI, anagrafica del paziente, prestazione, frequenza, totale
// accessi, operatori. Le letture incerte sono elencate in `incerti`,
// mai inventate.
//
// SICUREZZA:
//   • utente autenticato (cookie Supabase → getUser), 401 altrimenti;
//   • la foto NON viene salvata: transita solo verso l'API Anthropic;
//   • nessun accesso al DB: l'inserimento lo fa il client via RLS.
//
// MODELLO: claude-sonnet-4-6 (stesso di ai-clinical action "photo":
// per moduli fotografati storti/in ombra serve la vision di Sonnet).
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const PHOTO_MODEL = "claude-sonnet-4-6";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// ─── Prompt ───────────────────────────────────────────────────────────

const PROMPT = `Sei un assistente che digitalizza il "Modulo PAI Operatori" di una cooperativa di assistenza domiciliare italiana. Nella foto c'è un modulo cartaceo (può essere storto, in ombra o con trasparenze dal retro del foglio: ignora il testo in trasparenza e leggi solo la pagina in primo piano).

Estrai ESATTAMENTE questi campi e rispondi SOLO con un oggetto JSON, senza testo prima o dopo, senza backtick:

{
  "cooperativa": string | null,          // nome della cooperativa se visibile (logo/intestazione), es. "Santa Lucia"
  "data_arrivo": "YYYY-MM-DD" | null,
  "data_attivazione": "YYYY-MM-DD" | null,
  "data_scadenza": "YYYY-MM-DD" | null,
  "cognome": string | null,
  "nome": string | null,
  "data_nascita": "YYYY-MM-DD" | null,   // campo "Nato/a il"
  "residenza": string | null,            // via e civico
  "citta": string | null,                // solo il nome della città, senza distretto
  "distretto": string | null,            // es. "D" se compare "(Distretto D)"
  "recapiti": string | null,             // numero di telefono
  "diagnosi": string | null,
  "prestazione": string | null,          // es. "Fisioterapia"
  "frequenza_settimanale": number | null, // es. 3 se "Frequenza: 3 a settimana"
  "tot_accessi": number | null,          // es. 28 se "Tot accessi: 28"
  "operatori": string | null,            // null se "—" o vuoto
  "incerti": string[]                    // elenco "campo: motivo" per ogni lettura dubbia
}

REGOLE:
- Le date sul modulo sono in formato italiano GG/MM/AAAA: convertile in YYYY-MM-DD.
- Se un campo è vuoto, illeggibile o segnato con "—", usa null (e se illeggibile aggiungilo a "incerti").
- Il campo "Paziente" può contenere "Cognome Nome" su una riga: separali (il cognome viene prima).
- NON inventare MAI nulla: meglio null + voce in "incerti" che un valore sbagliato.
- "incerti" deve essere [] se tutto è leggibile con sicurezza.`;

// ─── Parsing & sanitizzazione ─────────────────────────────────────────

/** Estrae il primo JSON valido dalla risposta (gestisce code fence). */
function extractJSON(text: string): any {
  try { return JSON.parse(text.trim()); } catch {}
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  throw new Error("Risposta AI non parsabile come JSON: " + text.substring(0, 200));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanStr(v: unknown, max = 300): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t === "—" || t === "-") return null;
  return t.slice(0, max);
}

function cleanDate(v: unknown): string | null {
  const s = cleanStr(v, 10);
  return s && ISO_DATE.test(s) ? s : null;
}

function cleanInt(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i >= min && i <= max ? i : null;
}

function sanitizePaiResult(raw: any) {
  const incerti = Array.isArray(raw?.incerti)
    ? raw.incerti.filter((x: unknown) => typeof x === "string").map((x: string) => x.slice(0, 160)).slice(0, 20)
    : [];

  return {
    cooperativa: cleanStr(raw?.cooperativa, 80),
    data_arrivo: cleanDate(raw?.data_arrivo),
    data_attivazione: cleanDate(raw?.data_attivazione),
    data_scadenza: cleanDate(raw?.data_scadenza),
    cognome: cleanStr(raw?.cognome, 80),
    nome: cleanStr(raw?.nome, 80),
    data_nascita: cleanDate(raw?.data_nascita),
    residenza: cleanStr(raw?.residenza, 160),
    citta: cleanStr(raw?.citta, 80),
    distretto: cleanStr(raw?.distretto, 20),
    recapiti: cleanStr(raw?.recapiti, 60),
    diagnosi: cleanStr(raw?.diagnosi, 500),
    prestazione: cleanStr(raw?.prestazione, 80) ?? "Fisioterapia",
    frequenza_settimanale: cleanInt(raw?.frequenza_settimanale, 1, 7),
    tot_accessi: cleanInt(raw?.tot_accessi, 1, 500),
    operatori: cleanStr(raw?.operatori, 200),
    incerti,
  };
}

// ─── Handler POST ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Autenticazione (cookie Supabase)
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // 2. Chiave API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurata su Vercel" }, { status: 500 });
    }

    // 3. Validazione input
    const body = await req.json();
    const imageBase64 = (body?.image_base64 || "").trim();
    if (!imageBase64) {
      return NextResponse.json({ error: "Immagine mancante" }, { status: 400 });
    }
    // ~4MB binari in base64 ≈ 5.5M caratteri: sopra rischiamo il limite Vercel (4.5MB)
    if (imageBase64.length > 5_500_000) {
      return NextResponse.json(
        { error: "Immagine troppo grande. Riprova: verrà ricompressa automaticamente." },
        { status: 413 }
      );
    }
    const imageMediaType = ALLOWED_IMAGE_TYPES.has(body?.image_media_type)
      ? (body.image_media_type as string)
      : "image/jpeg";

    // 4. Chiamata vision ad Anthropic
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: PHOTO_MODEL,
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: imageMediaType, data: imageBase64 } },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: `Errore AI: ${data?.error?.message ?? JSON.stringify(data)}` },
        { status: response.status }
      );
    }

    const text = data.content?.[0]?.text ?? "";
    if (!text) {
      return NextResponse.json({ error: "Risposta AI vuota" }, { status: 500 });
    }

    const result = sanitizePaiResult(extractJSON(text));
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
