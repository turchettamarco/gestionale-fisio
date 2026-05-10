// ═══════════════════════════════════════════════════════════════════════
// src/lib/pdfHeader.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Header HTML standardizzato per tutti i documenti stampabili (PDF):
// body chart, ricevute, contratti, schede pazienti, programmi esercizi,
// privacy/consenso, planning calendario, report saldi/incassi, ecc.
//
// Caratteristiche:
//   - Logo dello studio se presente (massimo 60px alto)
//   - Nome studio in evidenza (gradient teal→blu come UI)
//   - Indirizzo, telefono, email se presenti
//   - Firma professionista (nome + titolo) se presenti
//   - Layout flex compatibile con stampa A4
//
// Uso:
//   import { studioPdfHeader, studioHeaderCss } from "@/src/lib/pdfHeader";
//
//   const html = `<!DOCTYPE html><html lang="it"><head>
//     <style>${studioHeaderCss}${TUE_REGOLE_CSS}</style>
//   </head><body>
//     ${studioPdfHeader(studio, { docTitle: "Body Chart", docSubtitle: nomePaziente })}
//     ...resto del documento...
//   </body></html>`;
//
// ═══════════════════════════════════════════════════════════════════════

export type StudioHeaderData = {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  signature_name?: string | null;
  signature_title?: string | null;
  logo_base64?: string | null;
  /** Se true, in PDF la firma diventa solo nome studio (no signature_name) */
  multi_operator_enabled?: boolean | null;
} | null | undefined;

export type PdfHeaderOptions = {
  /** Titolo del documento (es. "Body Chart", "Ricevuta noleggio") */
  docTitle?: string;
  /** Sottotitolo (es. nome paziente, "Nr. 0001/2026") */
  docSubtitle?: string;
  /** Data del documento (es. "Emesso il 25 aprile 2026"). Se omesso, usa oggi */
  docDate?: string;
  /** Se true non mostra il blocco "doc info" a destra (header solo studio) */
  hideDocInfo?: boolean;
};

/**
 * Escape HTML per evitare iniezioni nei dati studio
 */
function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * CSS per l'header studio. Da inserire nello <style> del documento.
 * Non interferisce con il resto del CSS del documento.
 */
export const studioHeaderCss = `
.fh-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  padding: 0 0 18px 0;
  margin-bottom: 24px;
  border-bottom: 2.5px solid #0d9488;
}
.fh-header-left {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
}
.fh-header-logo {
  flex-shrink: 0;
  max-height: 60px;
  max-width: 80px;
  object-fit: contain;
}
.fh-header-studio { min-width: 0; }
.fh-header-name {
  font-size: 18px;
  font-weight: 800;
  color: #0d9488;
  background: linear-gradient(135deg, #0d9488, #2563eb);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.2px;
  line-height: 1.2;
}
.fh-header-meta {
  font-size: 10.5px;
  color: #64748b;
  margin-top: 4px;
  line-height: 1.5;
}
.fh-header-meta span { white-space: nowrap; }
.fh-header-meta span + span::before { content: " · "; color: #cbd5e1; padding: 0 2px; }
.fh-header-doc {
  text-align: right;
  flex-shrink: 0;
}
.fh-header-doc-title {
  font-size: 14px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.2px;
  text-transform: uppercase;
}
.fh-header-doc-sub {
  font-size: 12px;
  color: #2563eb;
  font-weight: 700;
  margin-top: 4px;
}
.fh-header-doc-date {
  font-size: 10.5px;
  color: #64748b;
  margin-top: 3px;
}
@media print {
  .fh-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .fh-header-name { color: #0d9488 !important; -webkit-text-fill-color: #0d9488 !important; }
}
`;

/**
 * Genera l'HTML dell'header studio.
 * Usalo all'inizio del <body> del documento.
 */
export function studioPdfHeader(
  studio: StudioHeaderData,
  opts: PdfHeaderOptions = {}
): string {
  const name = esc(studio?.name) || "Studio";
  const logo = studio?.logo_base64 || "";

  // Riga meta: indirizzo, telefono, email, firma professionista
  const metaParts: string[] = [];
  if (studio?.address) metaParts.push(`<span>📍 ${esc(studio.address)}</span>`);
  if (studio?.phone) metaParts.push(`<span>📞 ${esc(studio.phone)}</span>`);
  if (studio?.email) metaParts.push(`<span>✉ ${esc(studio.email)}</span>`);
  const meta = metaParts.length ? `<div class="fh-header-meta">${metaParts.join("")}</div>` : "";

  // Riga firma — usa logica branding multi-op (se attivo, niente nome
  // personale del professionista, solo nome studio già visibile in alto).
  const firma: string[] = [];
  if (studio?.multi_operator_enabled === true) {
    // In multi-op il nome studio è già nell'header principale; non duplichiamo
    // signature_name: lasciamo firma vuota (= solo "Studio Fisiobin" in alto).
  } else {
    // Single-op: comportamento storico
    if (studio?.signature_title) firma.push(esc(studio.signature_title));
    if (studio?.signature_name) firma.push(esc(studio.signature_name));
  }
  const firmaHtml = firma.length
    ? `<div class="fh-header-meta" style="margin-top:2px;font-weight:600;color:#475569;">${firma.join(" ")}</div>`
    : "";

  // Logo (oppure placeholder testuale se mancante)
  const logoHtml = logo
    ? `<img class="fh-header-logo" src="${esc(logo)}" alt="Logo studio" />`
    : "";

  // Doc info a destra
  const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
  const docTitle = opts.docTitle ? `<div class="fh-header-doc-title">${esc(opts.docTitle)}</div>` : "";
  const docSub = opts.docSubtitle ? `<div class="fh-header-doc-sub">${esc(opts.docSubtitle)}</div>` : "";
  const docDate = !opts.hideDocInfo
    ? `<div class="fh-header-doc-date">${esc(opts.docDate || `Emesso il ${today}`)}</div>`
    : "";
  const docBlock = !opts.hideDocInfo && (opts.docTitle || opts.docSubtitle)
    ? `<div class="fh-header-doc">${docTitle}${docSub}${docDate}</div>`
    : "";

  return `<div class="fh-header">
  <div class="fh-header-left">
    ${logoHtml}
    <div class="fh-header-studio">
      <div class="fh-header-name">${name}</div>
      ${meta}
      ${firmaHtml}
    </div>
  </div>
  ${docBlock}
</div>`;
}

/**
 * Footer minimal per PDF (data generazione + nome studio piccolo).
 * Da usare a fine pagina per chiudere visivamente.
 */
export function studioPdfFooter(studio: StudioHeaderData): string {
  const generato = new Date().toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  return `<div style="margin-top:32px;padding-top:14px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#94a3b8;">
  <span>${esc(studio?.name) || "Studio"}</span>
  <span>Generato il ${generato}</span>
</div>`;
}
