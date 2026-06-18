// Logica server-side per il Sistema TS: costruzione XML "precompilata",
// cifratura dei codici fiscali con il certificato SOGEI SanitelCF e
// impacchettamento ZIP. Usato sia da /api/ts-xml (download) sia da
// /api/ts-invio (invio web service). SOLO server (usa node:crypto).

import crypto from "crypto";

// Certificato pubblico SOGEI "SanitelCF" (Agenzia delle Entrate), dal Kit 730
// Spese Sanitarie ver. 20240214 (valido fino al 23/01/2027). Pubblico: serve solo
// a CIFRARE i codici fiscali; SOGEI li decifra con la chiave privata.
// Da aggiornare se SOGEI rigenera il certificato.
const SANITEL_CF_PEM = `-----BEGIN CERTIFICATE-----
MIIEkjCCAnqgAwIBAgIIZB8Z/cNuJTMwDQYJKoZIhvcNAQELBQAwUDELMAkGA1UE
BhMCSVQxHjAcBgNVBAoMFUFnZW56aWEgZGVsbGUgRW50cmF0ZTEhMB8GA1UEAwwY
Q0EgQWdlbnppYSBkZWxsZSBFbnRyYXRlMB4XDTI0MDEyMzE1MjcxOFoXDTI3MDEy
MzE1MjcxN1owXjELMAkGA1UEBhMCSVQxHjAcBgNVBAoMFUFnZW56aWEgZGVsbGUg
RW50cmF0ZTEbMBkGA1UECwwSU2Vydml6aSBUZWxlbWF0aWNpMRIwEAYDVQQDDAlT
YW5pdGVsQ0YwgZ8wDQYJKoZIhvcNAQEBBQADgY0AMIGJAoGBANQfl8dJ65QsUGAI
RviObyQPA2AYBpxgVjTimrn+B9C9YUSz6bbZv83ZX5dMYb368G6zsJhvZvoqVZQG
ofz5psc9HzXNAtZ9BqaZfFQ1JJmdenarRSsTdPWXuJrkktAMQ10hEo1By2fG2oy1
f934idprxOvcoxsO6tqSF8W9MtHvAgMBAAGjgeUwgeIwHwYDVR0jBBgwFoAUrsVd
VIjaAAwlPJ1qgpTX7CJbd70wgY8GA1UdHwSBhzCBhDCBgaB/oH2Ge2xkYXA6Ly9j
YWRzLmVudHJhdGUuZmluYW56ZS5pdC9DTj1DQSUyMEFnZW56aWElMjBkZWxsZSUy
MEVudHJhdGUsTz1BZ2VuemlhJTIwZGVsbGUlMjBFbnRyYXRlLEM9SVQ/Y2VydGlm
aWNhdGVSZXZvY2F0aW9uTGlzdDAdBgNVHQ4EFgQUk40paPskEoq8te6R8PK19/Bb
02AwDgYDVR0PAQH/BAQDAgQwMA0GCSqGSIb3DQEBCwUAA4ICAQCAwgZ2r6sv9jvH
WDmQnV/mHQqx7+nZjxJFQ8i7u6KGp13EaqyBc2RJyn0wgQGaVxTpnypR9+qV/EKT
GTShBIraM6r/Gf7+nPYAgUy6zABCeJpX2Nnx9ItkbnEAVAJcOeI0493QbNTxlWTW
ypggXp+Hmuj6B9aX70ba6+QI74At9reBN/tBLpNLrrZ25xQJ4yTdSzDeoUd+bAQl
m2VedipTi6MxUL7NSP7JBFklhWrqFhIHpGOX7qlM39fgRcHKNlXRce1twT2KMKpo
0qWse0Sb0qdu+ZV0oYd5xh+0UxZtTwrMs4hup5MArrIRbYL5JroBDpV8JiUzzStM
98G++2aLGKZDnDK+JDcwU2PzVzYyjN14VtXZbBMdUjeiqnWWij9LT8qqTwii6hwi
vSDXknHPqzfenuX1cs09usQNCYMBGYp8W/bwiOHhzOfVj/am9yXiPy1cNWtrwZL0
h4gmz9eghl8f0Y9erlK0FTCK+zZ5BD4tpLpNcY4SDfeMs4ReLFduM1AAb4OOFYcJ
AycHS88oErjPrx/nuKKt7bRjzNVKLqJAECblooOUCbFnlcogVrXdaGCTD8ydvmVw
+/yzHTYPPyg5LkDpWzLBLqIP/eK/QSj/BUeqvt6A5KdLHHNCfE7EoqTjeZO2PyAw
cowubV6nTwxJbx7APGcDLCDp+Ua35Q==
-----END CERTIFICATE-----`;

let pubKeyCache: crypto.KeyObject | null = null;
function getPubKey(): crypto.KeyObject {
  if (!pubKeyCache) pubKeyCache = new crypto.X509Certificate(SANITEL_CF_PEM).publicKey;
  return pubKeyCache;
}

/** Cifra una stringa (CF o pincode) con SanitelCF (RSA PKCS#1 v1.5) + base64. */
export function encWithSanitel(value: string): string {
  return crypto
    .publicEncrypt({ key: getPubKey(), padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(value.trim().toUpperCase(), "utf8"))
    .toString("base64");
}
/** Cifra un pincode (NON forza maiuscolo). */
export function encPincode(pincode: string): string {
  return crypto
    .publicEncrypt({ key: getPubKey(), padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(pincode.trim(), "utf8"))
    .toString("base64");
}

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const imp = (n: number) => (Math.round((n || 0) * 100) / 100).toFixed(2);

export type TsDocIn = {
  numDocumento: string;
  dataEmissione: string;   // YYYY-MM-DD
  dataPagamento: string;   // YYYY-MM-DD
  cfCittadino: string;     // in chiaro
  pagamentoTracciato: "SI" | "NO";
  flagOpposizione: "0" | "1";
  tipoSpesa: string;
  importo: number;
};
export type TsXmlBody = {
  cfProprietario: string;
  pIva: string;
  dispositivo: number;
  naturaIVA: string;       // "N2.2" | "N4"
  documents: TsDocIn[];
  fileName?: string;
};

/** Costruisce l'XML "precompilata" conforme all'XSD 730_precompilata.xsd. */
export function buildPrecompilataXml(body: TsXmlBody): string {
  const L: string[] = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push('<precompilata xsi:noNamespaceSchemaLocation="730_precompilata.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">');
  L.push("\t<proprietario>");
  L.push(`\t\t<cfProprietario>${encWithSanitel(body.cfProprietario)}</cfProprietario>`);
  L.push("\t</proprietario>");
  for (const d of body.documents) {
    L.push("\t<documentoSpesa>");
    L.push("\t\t<idSpesa>");
    L.push(`\t\t\t<pIva>${esc(body.pIva.trim())}</pIva>`);
    L.push(`\t\t\t<dataEmissione>${esc(d.dataEmissione)}</dataEmissione>`);
    L.push("\t\t\t<numDocumentoFiscale>");
    L.push(`\t\t\t\t<dispositivo>${Number(body.dispositivo) || 1}</dispositivo>`);
    L.push(`\t\t\t\t<numDocumento>${esc(d.numDocumento)}</numDocumento>`);
    L.push("\t\t\t</numDocumentoFiscale>");
    L.push("\t\t</idSpesa>");
    L.push(`\t\t<dataPagamento>${esc(d.dataPagamento)}</dataPagamento>`);
    L.push("\t\t<flagOperazione>I</flagOperazione>");
    if (d.flagOpposizione !== "1" && d.cfCittadino && d.cfCittadino.trim()) {
      L.push(`\t\t<cfCittadino>${encWithSanitel(d.cfCittadino)}</cfCittadino>`);
    }
    L.push(`\t\t<pagamentoTracciato>${d.pagamentoTracciato === "SI" ? "SI" : "NO"}</pagamentoTracciato>`);
    L.push("\t\t<tipoDocumento>F</tipoDocumento>");
    L.push(`\t\t<flagOpposizione>${d.flagOpposizione === "1" ? "1" : "0"}</flagOpposizione>`);
    L.push("\t\t<voceSpesa>");
    L.push(`\t\t\t<tipoSpesa>${esc(d.tipoSpesa)}</tipoSpesa>`);
    L.push(`\t\t\t<importo>${imp(d.importo)}</importo>`);
    L.push(`\t\t\t<naturaIVA>${esc(body.naturaIVA || "N2.2")}</naturaIVA>`);
    L.push("\t\t</voceSpesa>");
    L.push("\t</documentoSpesa>");
  }
  L.push("</precompilata>");
  return L.join("\r\n") + "\r\n";
}

// ── Mini ZIP writer (store mode) ──
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipSingle(name: string, content: string): Buffer {
  const data = Buffer.from(content, "utf8");
  const nameBuf = Buffer.from(name, "utf8");
  const crc = crc32(data);
  const n = data.length, fnLen = nameBuf.length;
  const dosTime = 0, dosDate = 0x5cd2;
  const lfh = Buffer.alloc(30);
  lfh.writeUInt32LE(0x04034b50, 0); lfh.writeUInt16LE(20, 4); lfh.writeUInt16LE(0, 6);
  lfh.writeUInt16LE(0, 8); lfh.writeUInt16LE(dosTime, 10); lfh.writeUInt16LE(dosDate, 12);
  lfh.writeUInt32LE(crc, 14); lfh.writeUInt32LE(n, 18); lfh.writeUInt32LE(n, 22);
  lfh.writeUInt16LE(fnLen, 26); lfh.writeUInt16LE(0, 28);
  const localPart = Buffer.concat([lfh, nameBuf, data]);
  const cdh = Buffer.alloc(46);
  cdh.writeUInt32LE(0x02014b50, 0); cdh.writeUInt16LE(20, 4); cdh.writeUInt16LE(20, 6);
  cdh.writeUInt16LE(0, 8); cdh.writeUInt16LE(0, 10); cdh.writeUInt16LE(dosTime, 12); cdh.writeUInt16LE(dosDate, 14);
  cdh.writeUInt32LE(crc, 16); cdh.writeUInt32LE(n, 20); cdh.writeUInt32LE(n, 24);
  cdh.writeUInt16LE(fnLen, 28); cdh.writeUInt16LE(0, 30); cdh.writeUInt16LE(0, 32);
  cdh.writeUInt16LE(0, 34); cdh.writeUInt16LE(0, 36); cdh.writeUInt32LE(0, 38); cdh.writeUInt32LE(0, 42);
  const central = Buffer.concat([cdh, nameBuf]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(localPart.length, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localPart, central, eocd]);
}

export function safeBase(name: string | undefined, fallback = "spese-sanitarie-TS"): string {
  return (name || fallback).replace(/[^A-Za-z0-9._-]/g, "_");
}
