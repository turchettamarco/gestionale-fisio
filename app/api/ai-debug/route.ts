import { NextRequest, NextResponse } from "next/server";
export async function GET(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "no key" });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`);
  const d = await r.json();
  const models = (d.models ?? []).filter((m: any) => m.supportedGenerationMethods?.includes("generateContent")).map((m: any) => m.name);
  return NextResponse.json({ models, error: d.error?.message, total: d.models?.length });
}
