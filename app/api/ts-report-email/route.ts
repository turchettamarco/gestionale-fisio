import { NextRequest, NextResponse } from "next/server";
import { sendInvioReportEmail, type Riga } from "@/src/lib/contabilita/tsReportEmail";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  email: string;
  studioName?: string;
  periodo?: string;
  protocollo: string;
  esitoText?: string;
  ambiente: "test" | "prod";
  righe: Riga[];
  wsUser: string;
  wsPassword: string;
  wsPincode: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body?.email || !body?.protocollo) {
      return NextResponse.json({ error: "Email o protocollo mancanti." }, { status: 400 });
    }
    const r = await sendInvioReportEmail(body, { retry: true });
    return NextResponse.json({ ok: r.ok, emailed: r.ok, ricevutaInclusa: r.ricevutaInclusa, error: r.error }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore invio report email";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
