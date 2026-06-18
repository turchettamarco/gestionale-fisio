import { NextRequest, NextResponse } from "next/server";
import { buildPrecompilataXml, zipSingle, safeBase, type TsXmlBody } from "@/src/lib/contabilita/tsXmlServer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TsXmlBody;
    if (!body?.cfProprietario || !body?.pIva) {
      return NextResponse.json({ error: "Codice fiscale o partita IVA del professionista mancanti (Impostazioni → Sistema TS)." }, { status: 400 });
    }
    if (!body.documents?.length) {
      return NextResponse.json({ error: "Nessun documento da generare." }, { status: 400 });
    }
    const xml = buildPrecompilataXml(body);
    const base = safeBase(body.fileName);
    const zip = zipSingle(`${base}.xml`, xml);
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${base}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore generazione XML";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
