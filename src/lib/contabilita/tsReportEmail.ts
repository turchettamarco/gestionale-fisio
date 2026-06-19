// Helper condiviso: invia l'email di riepilogo invio Sistema TS (report + ricevuta
// PDF best-effort). Usato dal cron della coda e dalla route ts-report-email.
import { encPincode } from "@/src/lib/contabilita/tsXmlServer";
import { TS_ENDPOINTS, postSoap, basicAuth, pickTag } from "@/src/lib/contabilita/tsSoap";
import { sendEmail } from "@/src/lib/email";

export type Riga = { paziente: string; numero: string; importo: number };

export type ReportEmailParams = {
  email: string;
  studioName?: string;
  periodo?: string;
  protocollo: string;
  esitoText?: string;
  ambiente: "test" | "prod";
  righe: Riga[];
  wsUser?: string;
  wsPassword?: string;
  wsPincode?: string;
  studioId?: string;
};

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchRicevutaPdfOnce(p: ReportEmailParams): Promise<string | null> {
  const endpoint = TS_ENDPOINTS[p.ambiente === "prod" ? "prod" : "test"].ricevutaPdf;
  const pincodeCifrato = encPincode(p.wsPincode || "");
  const envelope =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ric="http://ricevutapdf.p730.sanita.sogei.it/">` +
    `<soapenv:Header/><soapenv:Body><ric:RicevutaPdf><DatiInputRichiesta>` +
    `<pinCode>${pincodeCifrato}</pinCode><protocollo>${esc(p.protocollo.trim())}</protocollo>` +
    `<opzionale1></opzionale1><opzionale2></opzionale2><opzionale3></opzionale3>` +
    `</DatiInputRichiesta></ric:RicevutaPdf></soapenv:Body></soapenv:Envelope>`;
  const headers = {
    "Content-Type": "text/xml; charset=UTF-8",
    "SOAPAction": '""',
    "Authorization": basicAuth(p.wsUser || "", p.wsPassword || ""),
    "Accept": "*/*",
  };
  try {
    const r = await postSoap(endpoint, Buffer.from(envelope, "utf8"), headers, p.ambiente === "test");
    let pdf = pickTag(r.text, "pdf");
    if (pdf) pdf = pdf.replace(/\s+/g, "");
    return pdf || null;
  } catch {
    return null;
  }
}

export async function sendInvioReportEmail(p: ReportEmailParams, opts?: { retry?: boolean }): Promise<{ ok: boolean; ricevutaInclusa: boolean; error?: string }> {
  let pdf: string | null = null;
  if (p.wsUser && p.wsPassword && p.wsPincode) {
    pdf = await fetchRicevutaPdfOnce(p);
    if (!pdf && opts?.retry) { await sleep(4000); pdf = await fetchRicevutaPdfOnce(p); }
  }
  const appUrl = process.env.APP_URL || "https://gestionale-fisio.vercel.app";
  const res = await sendEmail({
    template: "ts_invio_report",
    to: p.email.trim(),
    studioId: p.studioId,
    data: {
      studioName: p.studioName || "FisioHub",
      periodo: p.periodo || "",
      protocollo: p.protocollo.trim(),
      esitoText: p.esitoText || "File trasmesso e accolto dal Sistema TS.",
      ambiente: p.ambiente === "prod" ? "produzione" : "test",
      righe: Array.isArray(p.righe) ? p.righe : [],
      ricevutaInclusa: !!pdf,
      appUrl,
    },
    attachments: pdf ? [{ filename: `ricevuta-TS-${p.protocollo.trim()}.pdf`, content: pdf }] : undefined,
  });
  return { ok: res.ok, ricevutaInclusa: !!pdf, error: res.ok ? undefined : res.error };
}
