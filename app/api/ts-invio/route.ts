import { NextRequest, NextResponse } from "next/server";
import { buildPrecompilataXml, zipSingle, encPincode, safeBase, type TsXmlBody } from "@/src/lib/contabilita/tsXmlServer";
import { TS_ENDPOINTS, postSoap, basicAuth, pickTag } from "@/src/lib/contabilita/tsSoap";

export const runtime = "nodejs";
export const maxDuration = 60;

type InvioBody = TsXmlBody & {
  wsUser: string;
  wsPassword: string;
  wsPincode: string;
  ambiente: "test" | "prod";
};

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as InvioBody;

    if (!body?.cfProprietario || !body?.pIva) {
      return NextResponse.json({ error: "Codice fiscale o partita IVA del professionista mancanti (Impostazioni → Sistema TS)." }, { status: 400 });
    }
    if (!body.documents?.length) {
      return NextResponse.json({ error: "Nessun documento da inviare." }, { status: 400 });
    }
    if (!body.wsUser || !body.wsPassword || !body.wsPincode) {
      return NextResponse.json({ error: "Credenziali Web Service mancanti: inserisci utente, password e pincode in Impostazioni → Sistema TS." }, { status: 400 });
    }

    const ambiente = body.ambiente === "prod" ? "prod" : "test";
    const endpoint = TS_ENDPOINTS[ambiente].invio;

    const xml = buildPrecompilataXml(body);
    const base = safeBase(body.fileName);
    const fileName = `${base}.zip`;
    const zipBuf = zipSingle(`${base}.xml`, xml);
    const pincodeCifrato = encPincode(body.wsPincode);

    const envelope =
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ejb="http://ejb.invioTelematicoSS730p.sanita.finanze.it/">` +
      `<soapenv:Header/>` +
      `<soapenv:Body>` +
      `<ejb:inviaFileMtom>` +
      `<nomeFileAllegato>${esc(fileName)}</nomeFileAllegato>` +
      `<pincodeInvianteCifrato>${pincodeCifrato}</pincodeInvianteCifrato>` +
      `<datiProprietario><cfProprietario>${esc(body.cfProprietario.trim().toUpperCase())}</cfProprietario></datiProprietario>` +
      `<opzionale1></opzionale1><opzionale2></opzionale2><opzionale3></opzionale3>` +
      `<documento><inc:Include xmlns:inc="http://www.w3.org/2004/08/xop/include" href="cid:${esc(fileName)}"/></documento>` +
      `</ejb:inviaFileMtom>` +
      `</soapenv:Body>` +
      `</soapenv:Envelope>`;

    const CRLF = "\r\n";
    const boundary = "----=_Part_FisioHub_" + Date.now();
    const rootCid = "<root.message@fisiohub>";

    const part1 =
      `--${boundary}${CRLF}` +
      `Content-Type: application/xop+xml; charset=UTF-8; type="text/xml"${CRLF}` +
      `Content-Transfer-Encoding: 8bit${CRLF}` +
      `Content-ID: ${rootCid}${CRLF}${CRLF}` +
      envelope + CRLF;
    const part2Head =
      `--${boundary}${CRLF}` +
      `Content-Type: application/zip${CRLF}` +
      `Content-Transfer-Encoding: binary${CRLF}` +
      `Content-ID: <${fileName}>${CRLF}${CRLF}`;
    const closing = `${CRLF}--${boundary}--${CRLF}`;

    const mtomBody = Buffer.concat([
      Buffer.from(part1, "utf8"),
      Buffer.from(part2Head, "utf8"),
      zipBuf,
      Buffer.from(closing, "utf8"),
    ]);

    const headers = {
      "Content-Type": `multipart/related; type="application/xop+xml"; boundary="${boundary}"; start="${rootCid}"; start-info="text/xml"`,
      "SOAPAction": '""',
      "MIME-Version": "1.0",
      "Authorization": basicAuth(body.wsUser, body.wsPassword),
      "Accept": "*/*",
    };

    let httpStatus = 0;
    let respText = "";
    try {
      const r = await postSoap(endpoint, mtomBody, headers, ambiente === "test");
      httpStatus = r.status;
      respText = r.text;
    } catch (err: any) {
      const code = err?.code ? ` [${err.code}]` : "";
      return NextResponse.json({
        ok: false,
        ambiente,
        error: `Connessione al Sistema TS non riuscita${code}: ${err?.message || "errore di rete"}`,
        code: err?.code || null,
      }, { status: 200 });
    }

    const fault = pickTag(respText, "faultstring") || pickTag(respText, "faultcode");
    const codiceEsito = pickTag(respText, "codiceEsito");
    const descrizioneEsito = pickTag(respText, "descrizioneEsito");
    const protocollo = pickTag(respText, "protocollo");
    const dataAccoglienza = pickTag(respText, "dataAccoglienza");
    const idErrore = pickTag(respText, "idErrore");

    if (fault && !protocollo) {
      return NextResponse.json({
        ok: false,
        ambiente,
        httpStatus,
        error: `Sistema TS ha risposto con errore: ${fault}`,
        fault,
        raw: respText.slice(0, 4000),
      }, { status: 200 });
    }

    const accepted = ["000", "0000", "0"];
    const ok = !fault && ((codiceEsito !== null && accepted.includes(codiceEsito)) || (!!protocollo && !idErrore && codiceEsito === null));

    return NextResponse.json({
      ok,
      ambiente,
      httpStatus,
      protocollo,
      codiceEsito,
      descrizioneEsito,
      dataAccoglienza,
      idErrore,
      nomeFileAllegato: fileName,
      raw: respText.slice(0, 4000),
    }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore invio Sistema TS";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
