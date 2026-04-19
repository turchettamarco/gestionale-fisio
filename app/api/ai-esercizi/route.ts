import { NextRequest, NextResponse } from "next/server";

const MODELS_TO_TRY = [
  "gemini-2.5-flash",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash-lite-001",
  "gemini-2.0-flash-lite",
];

async function tryModel(model: string, prompt: string, apiKey: string) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    }
  );
  const data = await r.json();
  if (r.ok) {
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return { ok: true, text, model };
  }
  return { ok: false, error: data?.error?.message ?? String(r.status), model };
}

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY non configurata" }, { status: 500 });
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    const errors: string[] = [];
    for (const model of MODELS_TO_TRY) {
      const result = await tryModel(model, prompt, apiKey);
      if (result.ok && result.text) {
        console.log(`[ai-esercizi] OK model=${model}`);
        return NextResponse.json({ text: result.text });
      }
      errors.push(`${model}: ${result.error}`);
      console.log(`[ai-esercizi] failed model=${model} err=${result.error}`);
      // Se alta domanda aspetta 2 secondi e riprova con il prossimo
      if (result.error?.includes("high demand")) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    return NextResponse.json({ error: `Tutti i modelli non disponibili: ${errors.join(" | ")}` }, { status: 503 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
