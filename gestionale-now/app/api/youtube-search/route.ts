import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "YOUTUBE_API_KEY non configurata" }, { status: 500 });

  try {
    const searchQuery = `${query} fisioterapia esercizio riabilitazione`;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=1&relevanceLanguage=it&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data?.error?.message ?? "Errore YouTube API" }, { status: res.status });
    const videoId = data.items?.[0]?.id?.videoId ?? null;
    const title   = data.items?.[0]?.snippet?.title ?? null;
    return NextResponse.json({ videoId, title });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
