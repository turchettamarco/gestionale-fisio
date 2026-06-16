// app/api/ai-esercizi/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY non configurata su Vercel" }, { status: 500 });
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: `Errore: ${data?.error?.message ?? JSON.stringify(data)}` }, { status: response.status });
    }

    const text = data.content?.[0]?.text ?? "";
    if (!text) return NextResponse.json({ error: "Risposta vuota" }, { status: 500 });

    // Segnala se la risposta è stata troncata (max_tokens raggiunto)
    const truncated = data.stop_reason === "max_tokens";
    return NextResponse.json({ text, truncated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
