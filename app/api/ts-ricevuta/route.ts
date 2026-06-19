import { NextRequest, NextResponse } from "next/server";
import { encPincode } from "@/src/lib/contabilita/tsXmlServer";
import { TS_ENDPOINTS, postSoap, basicAuth, pickTag } from "@/src/lib/contabilita/tsSoap";
import { sendEmail } from "@/src/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  protocollo: string;
  wsUser: string;
  wsPassword: string;
  wsPincode: string;
  ambiente: "test" | "prod";
  email?: string;        // se presente, invia la ricevuta via email
  studioName?: string;
  periodo?: string;
  esitoText?: string;
};

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body?.protocollo) return NextResponse.json({ error: "Protocollo mancante." }, { status: 400 });
    if (!body.wsUser || !body.wsPassword || !body.wsPincode) {
      return NextResponse.json({ error: "Credenziali Web Service mancanti." }, { status: 400 });
    }
    const ambiente = body.ambiente === "prod" ? "prod" : "test";
    const endpoint = TS_ENDPOINTS[ambiente].ricevutaPdf;
    const pincodeCifrato = encPincode(body.wsPincode);

    const envelope =
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ric="http://ricevutapdf.p730.sanita.sogei.it/">` +
      `<soapenv:Header/>` +
      `<soapenv:Body>` +
      `<ric:RicevutaPdf>` +
      `<DatiInputRichiesta>` +
      `<pinCode>${pincodeCifrato}</pinCode>` +
      `<protocollo>${esc(body.protocollo.trim())}</protocollo>` +
      `<opzionale1></opzionale1><opzionale2></opzionale2><opzionale3></opzionale3>` +
      `</DatiInputRichiesta>` +
      `</ric:RicevutaPdf>` +
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
    let pdf = pickTag(respText, "pdf");
    if (pdf) pdf = pdf.replace(/\s+/g, "");

    if (!pdf) {
      const codiceNeg = pickTag(respText, "descrizione") || pickTag(respText, "esitoChiamata");
      return NextResponse.json({
        ok: false,
        ambiente,
        error: fault ? `Sistema TS: ${fault}` : (codiceNeg ? `Ricevuta non disponibile: ${codiceNeg}` : "Ricevuta non ancora disponibile. Riprova più tardi."),
        raw: respText.slice(0, 4000),
      }, { status: 200 });
    }

    let emailed = false;
    let emailError: string | null = null;
    if (body.email && body.email.trim()) {
      const appUrl = process.env.APP_URL || "https://gestionale-fisio.vercel.app";
      const res = await sendEmail({
        template: "ts_ricevuta",
        to: body.email.trim(),
        data: {
          studioName: body.studioName || "FisioHub",
          periodo: body.periodo || "",
          protocollo: body.protocollo.trim(),
          esitoText: body.esitoText || "File trasmesso al Sistema TS.",
          appUrl,
        },
        attachments: [{ filename: `ricevuta-TS-${body.protocollo.trim()}.pdf`, content: pdf }],
      });
      emailed = res.ok;
      if (!res.ok) emailError = res.error || "invio email non riuscito";
    }

    return NextResponse.json({ ok: true, ambiente, pdf, emailed, emailError, protocollo: body.protocollo.trim() }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore ricevuta PDF";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
