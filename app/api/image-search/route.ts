// app/api/image-search/route.ts
// Cerca automaticamente una foto dimostrativa per un esercizio.
// Funziona SENZA configurazione usando Openverse (immagini Creative Commons).
// Se imposti PEXELS_API_KEY su Vercel, usa Pexels (qualità foto migliore).
import { NextRequest, NextResponse } from "next/server";

type ImgResult = { url: string | null; thumbnail: string | null; title: string | null; source: string | null };

const EMPTY: ImgResult = { url: null, thumbnail: null, title: null, source: null };

async function searchPexels(query: string, apiKey: string): Promise<ImgResult> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) return EMPTY;
  const data = await res.json();
  const p = data?.photos?.[0];
  if (!p) return EMPTY;
  return {
    url: p.src?.large ?? p.src?.medium ?? p.src?.original ?? null,
    thumbnail: p.src?.medium ?? p.src?.small ?? null,
    title: p.alt || query,
    source: "pexels",
  };
}

async function searchOpenverse(query: string): Promise<ImgResult> {
  // Openverse: aggregatore di immagini Creative Commons, nessuna API key richiesta.
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=1&license_type=all-cc&mature=false`;
  const res = await fetch(url, { headers: { "User-Agent": "FisioHub/1.0 (exercise images)" } });
  if (!res.ok) return EMPTY;
  const data = await res.json();
  const r = data?.results?.[0];
  if (!r) return EMPTY;
  return {
    url: r.url ?? null,
    thumbnail: r.thumbnail ?? r.url ?? null,
    title: r.title || query,
    source: "openverse",
  };
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  try {
    const pexelsKey = process.env.PEXELS_API_KEY;
    let result: ImgResult = EMPTY;

    if (pexelsKey) {
      result = await searchPexels(query, pexelsKey);
      // Fallback su Openverse se Pexels non trova nulla
      if (!result.url) result = await searchOpenverse(query);
    } else {
      result = await searchOpenverse(query);
    }

    return NextResponse.json(result);
  } catch (e: any) {
    // Non bloccare la generazione esercizi se la ricerca foto fallisce
    return NextResponse.json(EMPTY);
  }
}
