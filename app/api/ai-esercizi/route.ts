// app/api/ai-esercizi/route.ts
import { NextRequest, NextResponse } from "next/server";

const MODELS_TO_TRY = [
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-flash-latest",
];

export async function POST(req: NextRequest) {
  try {
    const { prompt, listModels } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY non configurata" }, { status: 500 });

    // Modalità debug: lista modelli disponibili
    if (listModels) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=50`);
      const d = await r.json();
      const names = (d.models ?? [])
        .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m: any) => m.name);
      return NextResponse.json({ models: names, error: d.error?.message });
    }

    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    // Prova i modelli in sequenza finché uno funziona
    let lastError = "";
    for (const model of MODELS_TO_TRY) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (text) {
          console.log(`[ai-esercizi] OK with model: ${model}`);
          return NextResponse.json({ text, model });
        }
      }

      lastError = `${model}: ${data?.error?.message ?? response.status}`;
      console.log(`[ai-esercizi] Failed ${model}:`, lastError);
    }

    return NextResponse.json({ error: `Nessun modello disponibile. Ultimo errore: ${lastError}` }, { status: 500 });

  } catch (e: any) {
    console.error("[ai-esercizi] Exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
