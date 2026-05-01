// app/api/ai-generate-template/route.ts
// Genera un template WhatsApp usando Claude API.
// Il template usa i placeholder {nome} {data} {ora} ecc. e {firma} per la firma.

import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Configurazione mancante: ANTHROPIC_API_KEY richiesta su Vercel" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const {
      prompt,
      messageKind = "generico",
      availablePlaceholders = ["nome", "data", "ora", "luogo"],
      signature = "",
    } = body;

    if (!prompt || String(prompt).trim().length < 3) {
      return NextResponse.json(
        { error: "Descrivi cosa vuoi generare (almeno 3 caratteri)" },
        { status: 400 }
      );
    }

    const placeholdersList = availablePlaceholders
      .map((p: string) => `{${p}}`)
      .join(", ");

    const systemPrompt = `Sei un assistente che genera template di messaggi WhatsApp professionali per uno studio di fisioterapia/osteopatia italiano.

Regole:
- Rispondi SOLO con il testo del messaggio, nient'altro. Niente commenti, niente markdown, niente "Ecco il messaggio:", solo il template.
- Usa un tono cortese, professionale ma amichevole, in italiano.
- Inserisci i segnaposti tra parentesi graffe quando servono: ${placeholdersList}
- IMPORTANTE: alla fine del messaggio, metti sempre {firma} su una nuova riga (la firma dell'operatore verrà inserita al posto di quel placeholder).
- Non inventare altri placeholder oltre a quelli elencati.
- Tipo di messaggio richiesto: ${messageKind}
- Lunghezza: tieni il messaggio conciso (tra 2 e 6 righe, massimo 8).
- Usa il "lei" di cortesia.
- Puoi usare emoji con moderazione (massimo 1-2) solo se pertinenti al contesto.`;

    const userPrompt = `Genera un template di messaggio WhatsApp per questo caso: ${prompt}`;

    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[ai-generate-template] Claude API error:", res.status, errText);
      return NextResponse.json(
        { error: "Errore chiamata AI (status " + res.status + ")" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const textBlock = data?.content?.find?.((b: any) => b.type === "text");
    let template = textBlock?.text?.trim() || "";

    // Pulizia: rimuovi eventuali backtick o markdown dall'output
    template = template.replace(/^```[\w]*\n/, "").replace(/\n```$/, "").trim();

    if (!template) {
      return NextResponse.json(
        { error: "L'AI non ha restituito un template valido" },
        { status: 500 }
      );
    }

    // Se la firma è presente e il template non contiene {firma}, aggiungila
    if (signature && !template.includes("{firma}")) {
      template = template.trimEnd() + "\n\n{firma}";
    }

    return NextResponse.json({ template });
  } catch (e: any) {
    console.error("[ai-generate-template] exception:", e?.message);
    return NextResponse.json(
      { error: e?.message || "Errore server" },
      { status: 500 }
    );
  }
}
