// Trasporto SOAP verso il Sistema TS (endpoint, CA di test, POST https, auth).
// SOLO server. Condiviso da /api/ts-invio e /api/ts-esito.

import https from "https";
import tls from "tls";

const HOST_TEST = "https://invioSS730pTest.sanita.finanze.it";
const HOST_PROD = "https://invioSS730p.sanita.finanze.it";

export const TS_ENDPOINTS = {
  test: {
    invio: `${HOST_TEST}/InvioTelematicoSS730pMtomWeb/InvioTelematicoSS730pMtomPort`,
    esito: `${HOST_TEST}/EsitoStatoInviiWEB/EsitoInvioDatiSpesa730Service`,
    dettaglioErrori: `${HOST_TEST}/EsitoStatoInviiWEB/DettaglioErrori730Service`,
    ricevutaPdf: `${HOST_TEST}/Ricevute730ServiceWeb/ricevutePdf`,
  },
  prod: {
    invio: `${HOST_PROD}/InvioTelematicoSS730pMtomWeb/InvioTelematicoSS730pMtomPort`,
    esito: `${HOST_PROD}/EsitoStatoInviiWEB/EsitoInvioDatiSpesa730Service`,
    dettaglioErrori: `${HOST_PROD}/EsitoStatoInviiWEB/DettaglioErrori730Service`,
    ricevutaPdf: `${HOST_PROD}/Ricevute730ServiceWeb/ricevutePdf`,
  },
};

// CA dell'Agenzia delle Entrate (ambiente di TEST) che firma il certificato TLS
// del server di collaudo SOGEI.
const CA_ADE_TEST_PEM = `-----BEGIN CERTIFICATE-----
MIIFjzCCA3egAwIBAgIIFfaA/TILEDQwDQYJKoZIhvcNAQELBQAwVTELMAkGA1UE
BhMCSVQxHjAcBgNVBAoMFUFnZW56aWEgZGVsbGUgRW50cmF0ZTEmMCQGA1UEAwwd
Q0EgQWdlbnppYSBkZWxsZSBFbnRyYXRlIFRlc3QwHhcNMTgwNjIyMTY0MjUyWhcN
MzgwNjE3MTY0MjUyWjBVMQswCQYDVQQGEwJJVDEeMBwGA1UECgwVQWdlbnppYSBk
ZWxsZSBFbnRyYXRlMSYwJAYDVQQDDB1DQSBBZ2VuemlhIGRlbGxlIEVudHJhdGUg
VGVzdDCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAO4aQWAatVDceUIy
s5AX0+nlY9wUz87E18hhH29/DfCZmgS4q1hnq61MfG4S4V0CJk3yhy5ojP7JLahQ
WckfiOaRXEYu8DbQ+gZQGgGJ1AoU8pHmevGnqHgBCqolPo/t482IfbBK0M6K6KrS
HECTpCpVT550OAe9uH1azj+bOLDRm91Ud0wr1IHEHFZVIAAA9a+R+MIF2ptJ3WKn
ZsXoLUqhL8V17v4H4cSQSwZrB6DyPraKkm26jLu51kfSwHRhhrGfjWwhJ0flHVE+
iu0xMM78xLwUw/qmRG9oSdrWctwHNn+eF6TuLZtZbSsQHhiU5lhZIM8IH47+GGCt
9uz/WhYxwWJBKkKZDJNWOLtpuSUe225a26GA7ylH5xHPI6FB/LwF494yv5J/EM6W
Sj5tLnqVbl8xeNpWK8HFh6QiKKrDQJiK3/ioy5Tc0wapeJF3CKYHOa1FNjkDMBUF
AxOQEcQrPMnaLAVQbZM7/p0anNIcXiT53CJqJOWs/scFl5WmZsGcVndYbOLCQeiX
XPwVLI4hUGM7HTNZV8GkNcF20X/cYWrd+w40HRZf6ffS0KtxTnhWDdOMMaW9xfF9
FDY2Z6FcrhtZNEa49I2NkQcK5tkQUCr6zhWjXBKTLb6/1fAwzXj+9XKd8aUiDybW
RUUXTEREcZbPXTj8WQDPPSXHHZcJAgMBAAGjYzBhMA8GA1UdEwEB/wQFMAMBAf8w
HwYDVR0jBBgwFoAUcDVCjm5uQ9+S+bP9Mj5QMSmjH0YwHQYDVR0OBBYEFHA1Qo5u
bkPfkvmz/TI+UDEpox9GMA4GA1UdDwEB/wQEAwIBhjANBgkqhkiG9w0BAQsFAAOC
AgEAmuNjpOJrB8ahBZ/GpIzAcsAllLQo+X2mScc/8mU00IN8nkUmVcXeJ9TeP36q
LY0JTAtldQtkDFhNnJt+VNF40pIv9LmzNUgX/yunX2zsQl4gEGe3KjNB3utpYRPX
bshxT0URUM+SgL9K9eZmMvduvoqagNNZ4kXs+vyi+d4b+Dv8RIPmCUwI1sVOYmks
P6OnAPLbkhVCHzYd7oGI2mV8cnfn2gZayiC8KpN50AiVU+8s6ZixA+BiGbiK0gkf
lm467vy2Lzi2OFYhwJNwCvK8oUKjM/ok4nPoGvgkS9uTGhqo0A2GuXh4kgftvDy7
fN/Ov34NzQ34PmMLEytoyIFpekmggi4G9aljTXcwYiwnR+yUWtzWyyUQvS0iK5qK
PEOLqFsja2SfXudX7ZJjYPIyx/bC2WnWpAIYYegkErUI7oo3ugZpwYVneHtwGLIj
d/lDMX0VOZTNcqwU3YA5H99t2zBzBtLYBDBEmxhT7xVqM/WiDEJ8tj4rS1rgssFS
GAuWarfNMBV3auBEjfAqZn0MzERwB01pAKlGuIewKarSXhh07qhqKGb45xo5CNrd
2+VlA8g9+OOtWma+oLOiI1aF0oUr0QLTWbOm55AU9pR821EQH3zQjujgZVOAnqYQ
j/Z77c1xXezWwKYNrcuFAP1KQhB8y6wgPSAvZYJ/pDuWR+Y=
-----END CERTIFICATE-----`;

export function basicAuth(user: string, password: string): string {
  return "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
}

/** POST SOAP (eventualmente MTOM). insecure=true salta la verifica TLS (ambiente test). */
export function postSoap(
  endpoint: string,
  bodyBuf: Buffer,
  headers: Record<string, string>,
  insecure: boolean
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(endpoint);
    const agent = new https.Agent({
      ca: [...tls.rootCertificates, CA_ADE_TEST_PEM],
      rejectUnauthorized: !insecure,
      keepAlive: false,
    });
    const r = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        port: u.port ? Number(u.port) : 443,
        path: u.pathname + u.search,
        headers: { ...headers, "Content-Length": String(bodyBuf.length) },
        agent,
        timeout: 55_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    r.on("timeout", () => r.destroy(new Error("Timeout: il Sistema TS non ha risposto entro 55 secondi.")));
    r.on("error", (e) => reject(e));
    r.write(bodyBuf);
    r.end();
  });
}

/** Estrae il primo tag (con o senza prefisso namespace) dal testo SOAP. */
export function pickTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "i"));
  return m ? m[1].trim() : null;
}
