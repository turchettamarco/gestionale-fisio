// ═══════════════════════════════════════════════════════════════════════
// src/lib/consents/texts.ts
// ═══════════════════════════════════════════════════════════════════════
// Testi standard dei consensi A DISTANZA + renderer HTML del documento
// firmato.
//
// I testi rispecchiano quelli del flusso in-studio (modal desktop) ma
// vengono interpolati e SNAPSHOTTATI in patient_consents.body_text al
// momento dell'invio: modifiche future ai testi non toccano i consensi
// già inviati o firmati (requisito legale).
//
// Formato body_text: paragrafi separati da "\n\n". Le righe che iniziano
// con "• " sono rese come elenco puntato dal renderer.
// ═══════════════════════════════════════════════════════════════════════

export type ConsentType = "gdpr_informativa_privacy" | "consenso_trattamento";

export type ConsentStudioInfo = {
  signatureName: string | null;
  signatureTitle: string | null;
  address?: string | null;
  name?: string | null;
};

export type ConsentPatientInfo = {
  firstName: string;
  lastName: string;
};

function titolare(s: ConsentStudioInfo): string {
  return (
    [s.signatureName, s.signatureTitle, s.address].filter(Boolean).join(", ") ||
    s.name ||
    "il professionista"
  );
}

export function buildConsentTitle(type: ConsentType): string {
  return type === "gdpr_informativa_privacy"
    ? "Informativa Privacy e consenso al trattamento dei dati (Art. 13 Reg. UE 2016/679)"
    : "Consenso informato al trattamento fisioterapico (Legge n. 219/2017)";
}

export function buildConsentBody(
  type: ConsentType,
  studio: ConsentStudioInfo,
  patient: ConsentPatientInfo
): string {
  const nomePaziente = `${patient.lastName} ${patient.firstName}`.trim();

  if (type === "gdpr_informativa_privacy") {
    return [
      `Titolare del trattamento: ${titolare(studio)}.`,
      `Dati trattati: dati anagrafici e di contatto, dati relativi alla salute (Art. 9 GDPR), dati amministrativi e contabili.`,
      `Finalità del trattamento: erogazione delle prestazioni fisioterapiche, adempimento di obblighi di legge, gestione amministrativa e contabile, invio di promemoria appuntamenti tramite WhatsApp/SMS (previo consenso).`,
      `Conservazione: la documentazione sanitaria e fiscale è conservata per 10 anni come previsto dalla normativa vigente.`,
      `Diritti dell'interessato (Artt. 15–22 GDPR): accesso, rettifica, cancellazione, limitazione del trattamento, portabilità dei dati, opposizione. I diritti possono essere esercitati contattando direttamente il Titolare.`,
      `Io sottoscritto/a ${nomePaziente} dichiaro di aver letto e compreso la presente informativa e acconsento al trattamento dei miei dati personali, inclusi i dati relativi alla salute, per le finalità terapeutiche indicate.`,
      `Acconsento inoltre alla ricezione di promemoria appuntamenti tramite WhatsApp/SMS.`,
    ].join("\n\n");
  }

  return [
    `Paziente: ${nomePaziente}.`,
    `${studio.signatureName || "Il professionista"} mi ha illustrato in modo chiaro e comprensibile: la valutazione effettuata, il trattamento fisioterapico proposto (terapia manuale, esercizio terapeutico, terapia strumentale), i benefici attesi, i possibili effetti indesiderati (dolore post-seduta, ecchimosi, aggravamento transitorio dei sintomi) e le eventuali alternative terapeutiche.`,
    `Controindicazioni segnalate: portatori di pace-maker, gravidanza, neoplasie attive, ferite aperte, flebiti in fase acuta. Dichiaro di non essere a conoscenza, per quanto mi risulta, di controindicazioni al trattamento proposto.`,
    `• Dichiaro di aver ricevuto e compreso tutte le informazioni`,
    `• Dichiaro di non essere a conoscenza di controindicazioni`,
    `• Sono consapevole di poter revocare il presente consenso in qualsiasi momento`,
    `• Dichiaro di aver ricevuto copia dell'informativa privacy GDPR`,
    `Acconsento liberamente e consapevolmente all'esecuzione del trattamento fisioterapico nelle modalità concordate.`,
  ].join("\n\n");
}

export function consentTypeLabel(type: ConsentType): string {
  return type === "gdpr_informativa_privacy"
    ? "Informativa Privacy GDPR"
    : "Consenso al trattamento";
}

// ─── Renderer HTML documento firmato (stampabile) ────────────────────────

export type SignedConsentForRender = {
  title: string;
  body_text: string;
  signed_name: string | null;
  signed_at: string | null;
  signature_data: string | null;
  signer_ip?: string | null;
};

export function renderSignedConsentHtml(
  c: SignedConsentForRender,
  studio: ConsentStudioInfo
): string {
  const paragraphs = c.body_text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  let bodyHtml = "";
  let listOpen = false;
  for (const p of paragraphs) {
    if (p.startsWith("• ")) {
      if (!listOpen) { bodyHtml += "<ul>"; listOpen = true; }
      bodyHtml += `<li>${escapeHtml(p.slice(2))}</li>`;
    } else {
      if (listOpen) { bodyHtml += "</ul>"; listOpen = false; }
      bodyHtml += `<p>${escapeHtml(p)}</p>`;
    }
  }
  if (listOpen) bodyHtml += "</ul>";

  const signedDate = c.signed_at
    ? new Date(c.signed_at).toLocaleString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

  const header = [studio.signatureName, studio.signatureTitle]
    .filter(Boolean)
    .join(" · ") || studio.name || "";

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>${escapeHtml(c.title)}</title>
<style>
  body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 760px;
    margin: 0 auto; padding: 36px 28px; color: #0f172a; line-height: 1.7; }
  .head { border-bottom: 3px solid; border-image: linear-gradient(135deg,#0d9488,#2563eb) 1;
    padding-bottom: 14px; margin-bottom: 22px; }
  .head .studio { font-weight: 700; font-size: 15px;
    background: linear-gradient(135deg,#0d9488,#2563eb);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  h1 { font-size: 18px; margin: 6px 0 0; }
  p, li { font-size: 13px; }
  ul { padding-left: 22px; }
  .sig-block { margin-top: 32px; border: 1.5px solid #cbd5e1; border-radius: 12px;
    padding: 16px 20px; page-break-inside: avoid; }
  .sig-block .lbl { font-size: 10px; font-weight: 700; color: #64748b;
    text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }
  .sig-img { max-height: 90px; }
  .meta { font-size: 11px; color: #64748b; margin-top: 10px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="head">
    <div class="studio">${escapeHtml(header)}</div>
    <h1>${escapeHtml(c.title)}</h1>
  </div>
  ${bodyHtml}
  <div class="sig-block">
    <div class="lbl">Firmato digitalmente a distanza</div>
    ${c.signature_data ? `<img class="sig-img" src="${c.signature_data}" alt="Firma">` : ""}
    <div style="font-weight:700;font-size:13px;">${escapeHtml(c.signed_name ?? "—")}</div>
    <div class="meta">
      Data e ora firma: ${escapeHtml(signedDate)}
      ${c.signer_ip ? ` · IP: ${escapeHtml(c.signer_ip)}` : ""}
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
