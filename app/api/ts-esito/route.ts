import { NextRequest, NextResponse } from "next/server";
import { encPincode } from "@/src/lib/contabilita/tsXmlServer";
import { TS_ENDPOINTS, postSoap, basicAuth, pickTag } from "@/src/lib/contabilita/tsSoap";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  protocollo: string;
  wsUser: string;
  wsPassword: string;
  wsPincode: string;
  ambiente: "test" | "prod";
};

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const numOrNull = (s: string | null) => (s == null || s === "" ? null : Number(s));

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body?.protocollo) {
      return NextResponse.json({ error: "Protocollo mancante." }, { status: 400 });
    }
    if (!body.wsUser || !body.wsPassword || !body.wsPincode) {
      return NextResponse.json({ error: "Credenziali Web Service mancanti." }, { status: 400 });
    }
    const ambiente = body.ambiente === "prod" ? "prod" : "test";
    const endpoint = TS_ENDPOINTS[ambiente].esito;
    const pincodeCifrato = encPincode(body.wsPincode);

    const envelope =
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:esit="http://esitoinvio.p730.sanita.sogei.it/">` +
      `<soapenv:Header/>` +
      `<soapenv:Body>` +
      `<esit:EsitoInvii>` +
      `<DatiInputRichiesta>` +
      `<pinCode>${pincodeCifrato}</pinCode>` +
      `<protocollo>${esc(body.protocollo.trim())}</protocollo>` +
      `<opzionale1></opzionale1><opzionale2></opzionale2><opzionale3></opzionale3>` +
      `</DatiInputRichiesta>` +
      `</esit:EsitoInvii>` +
      `</soapenv:Body>` +
      `</soapenv:Envelope>`;

    const headers = {
      "Content-Type": "text/xml; charset=UTF-8",
      "SOAPAction": '""',
      "Authorization": basicAuth(body.wsUser, body.wsPassword),
      "Accept": "*/*",
    };

    let respText = "";
    try {
      const r = await postSoap(endpoint, Buffer.from(envelope, "utf8"), headers, ambiente === "test");
      respText = r.text;
    } catch (err: any) {
      const code = err?.code ? ` [${err.code}]` : "";
      return NextResponse.json({ ok: false, ambiente, error: `Connessione al Sistema TS non riuscita${code}: ${err?.message || "errore di rete"}` }, { status: 200 });
    }

    const fault = pickTag(respText, "faultstring") || pickTag(respText, "message");
    const esitoChiamata = pickTag(respText, "esitoChiamata");
    const descrizioneEsito = pickTag(respText, "descrizioneEsito");

    // dettaglio positivo (se presente)
    const stato = numOrNull(pickTag(respText, "stato"));
    const descrizione = pickTag(respText, "descrizione");
    const nInviati = numOrNull(pickTag(respText, "nInviati"));
    const nAccolti = numOrNull(pickTag(respText, "nAccolti"));
    const nWarnings = numOrNull(pickTag(respText, "nWarnings"));
    const nErrori = numOrNull(pickTag(respText, "nErrori"));
    const dataInvio = pickTag(respText, "dataInvio");

    // dettaglio negativo (codice/descrizione dentro esitiNegativi)
    const codiceNeg = pickTag(respText, "codice");

    const trovato = nInviati !== null || nAccolti !== null || stato !== null;

    if (fault && !trovato) {
      return NextResponse.json({ ok: false, ambiente, error: `Sistema TS: ${fault}`, raw: respText.slice(0, 4000) }, { status: 200 });
    }

    return NextResponse.json({
      ok: true,
      ambiente,
      esitoChiamata,
      descrizioneEsito,
      trovato,
      dettaglio: trovato ? { stato, descrizione, nInviati, nAccolti, nWarnings, nErrori, dataInvio } : null,
      codiceNegativo: codiceNeg,
      raw: respText.slice(0, 4000),
    }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore verifica esito";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
