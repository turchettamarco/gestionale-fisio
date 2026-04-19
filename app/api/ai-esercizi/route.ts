// app/api/ai-esercizi/route.ts
// Usa Gemini (gratuito) per generare schede esercizi

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY non configurata su Vercel" }, { status: 500 });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1500,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("[ai-esercizi] Gemini error:", JSON.stringify(data));
      return NextResponse.json({ error: `Gemini error ${response.status}: ${data?.error?.message ?? JSON.stringify(data)}` }, { status: response.status });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) {
      console.error("[ai-esercizi] Empty response:", JSON.stringify(data));
      return NextResponse.json({ error: "Risposta vuota da Gemini" }, { status: 500 });
    }

    console.log("[ai-esercizi] OK, text length:", text.length);
    return NextResponse.json({ text });
  } catch (e: any) {
    console.error("[ai-esercizi] Exception:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Errore server" }, { status: 500 });
  }
}
