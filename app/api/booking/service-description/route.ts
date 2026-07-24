// app/api/booking/service-description/route.ts
// ════════════════════════════════════════════════════════════════════════
// POST /api/booking/service-description
// Propone una riga di spiegazione per un servizio prenotabile, partendo
// dal suo nome (mig. 086).
//
// Es. "Prima visita fisioterapica" → "Valutazione clinica e piano
//      terapeutico personalizzato"
//
// AUTENTICAZIONE: a differenza delle altre route ai-* del progetto, qui
// si richiede un token di sessione valido. È una chiamata che costa (API
// Anthropic a consumo) e senza controllo sarebbe utilizzabile da chiunque
// conosca l'indirizzo.
// ════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabaseServer";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Haiku 4.5: la descrizione è una riga sola, non serve un modello più
// grande. Lo stesso usato da ai-esercizi e ai-clinical.
const MODEL = "claude-haiku-4-5-20251001";

export async function POST(req: NextRequest) {
  try {
    // ── Sessione valida? ────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }
    const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !userData?.user) {
      return NextResponse.json({ error: "Sessione non valida" }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Configurazione mancante: ANTHROPIC_API_KEY richiesta su Vercel" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const duration = Number(body?.duration) || null;

    if (name.length < 3) {
      return NextResponse.json(
        { error: "Scrivi prima il nome del servizio (almeno 3 caratteri)" },
        { status: 400 }
      );
    }

    const systemPrompt = `Sei un assistente che scrive le descrizioni dei servizi per la pagina di prenotazione online di uno studio di fisioterapia e osteopatia italiano.

Ti viene dato il NOME di un servizio e devi restituire una riga che spieghi al paziente in cosa consiste.

Regole ferree:
- Rispondi SOLO con la descrizione. Niente virgolette, niente markdown, niente "Ecco la descrizione:", nessun commento.
- Massimo 60 caratteri. Deve stare su una riga sotto il nome del servizio.
- Niente punto finale.
- Italiano, tono professionale e rassicurante, comprensibile a un paziente senza competenze mediche.
- Descrivi COSA COMPRENDE la prestazione, non i suoi benefici promessi. Non promettere guarigioni, risultati o tempi di recupero.
- Non inventare durate, prezzi, numero di sedute o attrezzature che non siano già implicite nel nome.
- Non usare emoji.

Esempi dello stile richiesto:
"Prima visita fisioterapica" → Valutazione clinica e piano terapeutico
"Seduta fisioterapica" → Trattamento individuale
"Visita domiciliare" → Trattamento a domicilio
"TECAR terapia" → Diatermia strumentale
"Laser terapia" → Laserterapia Nd:YAG
"Noleggio magnetoterapia" → Apparecchio per uso domiciliare`;

    const userPrompt = duration
      ? `Nome del servizio: "${name}" (durata ${duration} minuti)`
      : `Nome del servizio: "${name}"`;

    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 100,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[booking/service-description] Claude API error:", res.status, errText);
      return NextResponse.json(
        { error: "Errore chiamata AI (status " + res.status + ")" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const textBlock = data?.content?.find?.(
      (b: { type: string; text?: string }) => b.type === "text"
    );

    let description = String(textBlock?.text ?? "").trim();
    // Ripulisce eventuali virgolette o backtick attorno alla risposta
    description = description
      .replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "")
      .replace(/^["'«»]+|["'«».]+$/g, "")
      .trim();

    // Se sfora, taglia sull'ultimo spazio invece che a metà parola
    if (description.length > 70) {
      const cut = description.slice(0, 70);
      const lastSpace = cut.lastIndexOf(" ");
      description = (lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim();
    }

    if (!description) {
      return NextResponse.json(
        { error: "L'AI non ha restituito una descrizione valida" },
        { status: 500 }
      );
    }

    return NextResponse.json({ description });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore server";
    console.error("[booking/service-description] exception:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
