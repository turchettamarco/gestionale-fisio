// ═══════════════════════════════════════════════════════════════════════
// /api/ai-tariffario
// ═══════════════════════════════════════════════════════════════════════
//
// Legge il tariffario di un ente da una FOTO o da un PDF e restituisce le
// voci strutturate, pronte da importare nel listino.
//
// Perché serve: i nomenclatori dei fondi arrivano come PDF di trenta righe
// o come foto del foglio consegnato in studio. Ribatterli a mano è mezz'ora
// e qualche errore di battitura sui prezzi.
//
// Perché NON scarichiamo i tariffari da internet: sono documenti riservati
// alle strutture convenzionate, cambiano per piano e per anno. Un numero
// pescato da un sito terzo sarebbe verosimile ma sbagliato — e sulle
// tariffe è il danno peggiore. Qui il documento ufficiale lo fornisci tu.
//
// Input:  { image_base64, media_type }  oppure  { pdf_base64 }
// Output: { result: { voci: [{ prestazione, tariffa_ente, quota_paziente }] } }
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Lettura di tabelle e scansioni: serve il modello più capace.
const MODEL = "claude-sonnet-4-6";

const PROMPT = `Sei un assistente che legge tariffari di fondi sanitari e assicurazioni italiane.

COMPITO: estrai dal documento TUTTE le righe che indicano una prestazione con la relativa tariffa.

REGOLE:
- "prestazione": il nome della prestazione come scritto nel documento (es. "Seduta di fisioterapia", "Rieducazione motoria individuale", "Tecarterapia", "Visita fisiatrica").
- "tariffa_ente": l'importo a carico del fondo/assicurazione (numero, punto decimale, senza simbolo €). Se il documento riporta una sola tariffa, mettila qui.
- "quota_paziente": eventuale ticket, scoperto o quota a carico dell'assistito (numero). Se non indicata, usa null.
- NON inventare importi: se un valore non è leggibile, metti null.
- Ignora intestazioni, note legali, numeri di pagina, loghi.
- Se il documento non è un tariffario, restituisci un array vuoto.
- Massimo 120 voci.

Rispondi SOLO con un oggetto JSON in questo formato esatto:
{"voci": [{"prestazione": "...", "tariffa_ente": 25.00, "quota_paziente": null}]}

Niente preamboli, niente markdown, solo JSON.`;

function extractJSON(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* niente */ }
    }
    return { voci: [] };
  }
}

type Voce = { prestazione: string; tariffa_ente: number | null; quota_paziente: number | null };

function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return Math.round(v * 100) / 100;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d,.-]/g, "").replace(",", "."));
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  return null;
}

function sanitize(raw: unknown): { voci: Voce[] } {
  const arr = (raw as { voci?: unknown })?.voci;
  if (!Array.isArray(arr)) return { voci: [] };
  const out: Voce[] = [];
  for (const it of arr.slice(0, 120)) {
    const o = it as Record<string, unknown>;
    const prestazione = typeof o.prestazione === "string" ? o.prestazione.trim() : "";
    if (!prestazione) continue;
    out.push({
      prestazione: prestazione.slice(0, 160),
      tariffa_ente: num(o.tariffa_ente),
      quota_paziente: num(o.quota_paziente),
    });
  }
  return { voci: out };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image_base64, media_type, pdf_base64 } = body as {
      image_base64?: string; media_type?: string; pdf_base64?: string;
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurata su Vercel" }, { status: 500 });
    }
    if (!image_base64 && !pdf_base64) {
      return NextResponse.json({ error: "Nessun documento ricevuto" }, { status: 400 });
    }

    const content: unknown[] = [];
    if (pdf_base64) {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdf_base64 },
      });
    } else {
      content.push({
        type: "image",
        source: { type: "base64", media_type: media_type || "image/jpeg", data: image_base64 },
      });
    }
    content.push({ type: "text", text: PROMPT });

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: `Errore AI: ${data?.error?.message ?? JSON.stringify(data)}` },
        { status: response.status },
      );
    }

    const text = data.content?.[0]?.text ?? "";
    if (!text) return NextResponse.json({ error: "Risposta AI vuota" }, { status: 500 });

    return NextResponse.json({ result: sanitize(extractJSON(text)) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Errore server" },
      { status: 500 },
    );
  }
}
