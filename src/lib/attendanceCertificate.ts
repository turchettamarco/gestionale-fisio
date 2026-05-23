// ═══════════════════════════════════════════════════════════════════════
// src/lib/attendanceCertificate.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Utility client-side per la generazione dell'attestato di presenza PDF
// (richiesto come prova di partecipazione alle sedute di fisioterapia).
//
// Espone due funzioni:
//   • downloadCertificateSingle(data)  → attestato per UNA singola data
//                                         (usato dal modale appuntamento)
//   • downloadCertificateMulti(data)   → attestato cumulativo con LISTA di date
//                                         (usato dalla scheda paziente)
//
// Generazione 100% client-side con jsPDF puro (no html2canvas, no API server)
// per lo stesso pattern di exportGuestAgenda.ts → niente serverless overhead.
//
// Header studio: gradient teal→blu + dati anagrafici professionista
// (nome, indirizzo, P.IVA da practice_settings, numero albo da studios,
// mig. 034). Logo se presente, fallback iniziale colorata.
//
// ═══════════════════════════════════════════════════════════════════════

import type { jsPDF as JsPDFType } from "jspdf";

// ── Tipi pubblici ────────────────────────────────────────────────────────

/** Dati dello studio + professionista (header attestato) */
export type CertificateStudioData = {
  name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  /** Firma: usata come "Dott. [signatureName]" nel corpo */
  signature_name: string | null;
  /** Qualifica: "Fisioterapista e Osteopata" (sotto la firma) */
  signature_title: string | null;
  logo_base64: string | null;
  /** Numero iscrizione albo (mig. 034, tabella studios) */
  professional_register_number: string | null;
  /** Nome albo (mig. 034, default TSRM-PSTRP) */
  professional_register_name: string | null;
  /** Partita IVA (tabella practice_settings) */
  vat_number: string | null;
};

/** Dati paziente */
export type CertificatePatientData = {
  first_name: string;
  last_name: string;
  /** Data di nascita ISO (YYYY-MM-DD) o null */
  birth_date: string | null;
  /** Sesso (m/f) per concordanze "il/la Sig./Sig.ra", "nato/a"… */
  gender?: "m" | "f" | null;
};

/** Variante singola (per modale appuntamento) */
export type CertificateSingleData = {
  studio: CertificateStudioData;
  patient: CertificatePatientData;
  /** Data dell'appuntamento (ISO o Date) */
  date: Date | string;
  /** Tipo di seduta (default "fisioterapia") */
  treatmentLabel?: string;
};

/** Variante cumulativa (per scheda paziente) */
export type CertificateMultiData = {
  studio: CertificateStudioData;
  patient: CertificatePatientData;
  /** Date selezionate (già filtrate dal chiamante; almeno una) */
  dates: Array<{ date: Date | string; treatmentLabel?: string }>;
};

// ── Helpers formato ──────────────────────────────────────────────────────

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

/** Formatta data: "Lunedì 4 maggio 2026" */
function fmtDateLong(d: Date): string {
  return d
    .toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .replace(/^./, (c) => c.toUpperCase());
}

/** Formatta data breve: "23/05/2026" */
function fmtDateShort(d: Date): string {
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Estrae città da indirizzo "Via X, 12345 Città (PR)" → "Città" */
function extractCity(address: string | null): string {
  if (!address) return "";
  // pattern "..., 12345 CITTÀ (PR)" → CITTÀ
  const m = address.match(/\d{5}\s+([^()(,]+?)(\s*\([A-Z]{2}\))?\s*$/);
  if (m) return m[1].trim();
  // fallback: ultimo segmento dopo l'ultima virgola
  const parts = address.split(",");
  return parts[parts.length - 1].trim();
}

/** Calcola pronomi/concordanze in base al genere */
function pronouns(gender: "m" | "f" | null | undefined): {
  signor: string;
  nato: string;
  recato: string;
  interessato: string;
} {
  if (gender === "f") {
    return {
      signor: "la Sig.ra",
      nato: "nata",
      recato: "si è recata",
      interessato: "interessata",
    };
  }
  if (gender === "m") {
    return {
      signor: "il Sig.",
      nato: "nato",
      recato: "si è recato",
      interessato: "interessato",
    };
  }
  // default neutro (uso barrato)
  return {
    signor: "il/la Sig./Sig.ra",
    nato: "nato/a",
    recato: "si è recato/a",
    interessato: "interessato/a",
  };
}

// ── Costanti grafiche ────────────────────────────────────────────────────

const COLOR_TEAL = [13, 148, 136] as const;
const COLOR_BLUE = [37, 99, 235] as const;
const COLOR_TEXT = [15, 23, 42] as const;
const COLOR_MUTED = [100, 116, 139] as const;
const COLOR_BG_BOX = [248, 250, 252] as const;
const COLOR_BORDER = [226, 232, 240] as const;

const MARGIN_X = 22; // mm
const PAGE_W = 210; // A4
const PAGE_H = 297;

// ── Rendering blocchi ────────────────────────────────────────────────────

/**
 * Disegna l'header standard dell'attestato (banda colorata + logo/iniziale
 * + dati studio + linea divisoria + titolo "Attestato di Presenza").
 * Ritorna la Y del cursore dopo l'header (pronta per il corpo).
 */
function drawHeader(doc: JsPDFType, studio: CertificateStudioData): number {
  const topY = 22;
  let leftY = topY;

  // Nome studio (titolo)
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_TEAL[0], COLOR_TEAL[1], COLOR_TEAL[2]);
  doc.text(studio.name || "Studio", MARGIN_X, leftY);
  leftY += 6;

  // Riga 1: Dott. X — Qualifica
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  const profLine = [
    studio.signature_name ? `Dott. ${studio.signature_name}` : null,
    studio.signature_title,
  ]
    .filter(Boolean)
    .join(" — ");
  if (profLine) {
    doc.text(profLine, MARGIN_X, leftY);
    leftY += 4.5;
  }

  // Riga 2: indirizzo
  if (studio.address) {
    doc.text(studio.address, MARGIN_X, leftY);
    leftY += 4.5;
  }

  // Riga 3: P.IVA + n. albo
  const fiscalParts: string[] = [];
  if (studio.vat_number) fiscalParts.push(`P.IVA ${studio.vat_number}`);
  if (studio.professional_register_number) {
    const albo = studio.professional_register_name || "TSRM-PSTRP";
    fiscalParts.push(`Iscr. Albo ${albo} n. ${studio.professional_register_number}`);
  }
  if (fiscalParts.length > 0) {
    doc.text(fiscalParts.join(" · "), MARGIN_X, leftY);
    leftY += 4.5;
  }

  // ── Logo a destra SOLO se caricato ───────────────────────────────────
  // Se non c'è logo, l'header resta sobrio (compatibile con stampa B/N).
  let rightBlockBottom = topY;
  if (studio.logo_base64) {
    const logoX = PAGE_W - MARGIN_X - 22;
    const logoY = topY - 4;
    const logoSize = 22;
    try {
      doc.addImage(studio.logo_base64, "PNG", logoX, logoY, logoSize, logoSize);
      rightBlockBottom = logoY + logoSize;
    } catch {
      // base64 non valido → ignoro silenziosamente, header rimane sobrio
    }
  }

  // ── Titolo documento (niente separatore: header sobrio per B/N) ──────
  const headerBottom = Math.max(leftY, rightBlockBottom);
  let y = headerBottom + 22;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text("DOCUMENTO UFFICIALE", PAGE_W / 2, y, { align: "center" });

  y += 9;
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text("Attestato di Presenza", PAGE_W / 2, y, { align: "center" });

  y += 7;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text("Trattamento fisioterapico", PAGE_W / 2, y, { align: "center" });

  return y + 15;
}

/** Box con iniziale colorata (fallback senza logo) */
function drawInitialBox(
  doc: JsPDFType,
  x: number,
  y: number,
  size: number,
  studioName: string | null
): void {
  doc.setFillColor(COLOR_TEAL[0], COLOR_TEAL[1], COLOR_TEAL[2]);
  // jsPDF non ha bordi rounded nativi facili in mm, usiamo roundedRect
  doc.roundedRect(x, y, size, size, 2.5, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  const initial = (studioName || "S").trim().charAt(0).toUpperCase();
  doc.text(initial, x + size / 2, y + size / 2 + 3, { align: "center" });
}

/** Disegna il corpo introduttivo (frase notarile). Ritorna Y dopo. */
function drawIntroBody(
  doc: JsPDFType,
  startY: number,
  studio: CertificateStudioData,
  patient: CertificatePatientData,
  variant: "single" | "multi"
): number {
  const p = pronouns(patient.gender);
  const docName = studio.signature_name ? `Dott. ${studio.signature_name}` : "il sottoscritto";
  const qualifica = studio.signature_title || "Fisioterapista";

  const patientFullName = `${patient.first_name} ${patient.last_name}`.trim();
  const birthPart =
    patient.birth_date
      ? `, ${p.nato} il ${fmtDateShort(toDate(patient.birth_date))}`
      : "";

  const sedutaPart =
    variant === "single"
      ? `${p.recato} presso questo studio per sottoporsi a seduta di trattamento fisioterapico nella giornata di seguito riportata.`
      : `${p.recato} presso questo studio per sottoporsi alle sedute di trattamento fisioterapico nelle giornate di seguito riportate.`;

  const fullText =
    `Il sottoscritto ${docName}, in qualità di ${qualifica} titolare dello studio in epigrafe, ` +
    `attesta che ${p.signor} ${patientFullName}${birthPart}, ${sedutaPart}`;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);

  const usableWidth = PAGE_W - 2 * MARGIN_X;
  const lines = doc.splitTextToSize(fullText, usableWidth);
  doc.text(lines, MARGIN_X, startY, { align: "justify", maxWidth: usableWidth });

  return startY + lines.length * 5.5 + 4;
}

/** Box centrale per la variante SINGOLA */
function drawSingleDateBox(
  doc: JsPDFType,
  startY: number,
  date: Date,
  treatmentLabel: string
): number {
  // Niente sfondo né barre colorate (compatibile B/N).
  // Solo testo centrato con due linee orizzontali sottili sopra/sotto.
  const boxY = startY + 6;
  const boxH = 30;

  // Linea sottile grigia in alto
  doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_X + 40, boxY, PAGE_W - MARGIN_X - 40, boxY);

  // Label
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text("GIORNATA DEL TRATTAMENTO", PAGE_W / 2, boxY + 7, { align: "center" });

  // Data evidenziata
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text(fmtDateLong(date), PAGE_W / 2, boxY + 17, { align: "center" });

  // Tipo seduta
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(treatmentLabel, PAGE_W / 2, boxY + 24, { align: "center" });

  // Linea sottile grigia in basso
  doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_X + 40, boxY + boxH, PAGE_W - MARGIN_X - 40, boxY + boxH);

  return boxY + boxH + 6;
}

/** Box con lista di date per la variante CUMULATIVA */
function drawMultiDatesBox(
  doc: JsPDFType,
  startY: number,
  dates: Array<{ date: Date; treatmentLabel: string }>
): number {
  // Niente sfondo né barre colorate (compatibile B/N).
  // Tabella sobria con label intestazione + righe + totale.
  const x = MARGIN_X;
  let y = startY + 6;
  const w = PAGE_W - 2 * MARGIN_X;
  const rowH = 7;

  // Label intestazione
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text("GIORNATE DI TRATTAMENTO", x, y);

  // Linea sottile sotto la label
  y += 2;
  doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + w, y);

  // Righe date
  let rowY = y + 5;
  for (let i = 0; i < dates.length; i++) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
    doc.text(fmtDateLong(dates[i].date), x, rowY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
    doc.text(dates[i].treatmentLabel, x + w, rowY, { align: "right" });

    // Separatore tratteggiato sottile tra le righe (non sotto l'ultima)
    if (i < dates.length - 1) {
      doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([0.5, 0.7], 0);
      doc.line(x, rowY + 2, x + w, rowY + 2);
      doc.setLineDashPattern([], 0);
    }
    rowY += rowH;
  }

  // Linea totale (più marcata)
  doc.setDrawColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.setLineWidth(0.4);
  doc.line(x, rowY - 1, x + w, rowY - 1);

  // Totale a destra
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text(
    `Totale: ${dates.length} sedut${dates.length === 1 ? "a" : "e"}`,
    x + w,
    rowY + 5,
    { align: "right" }
  );

  return rowY + 12;
}

/** Frase di chiusura "Si rilascia a richiesta..." */
function drawClosingText(doc: JsPDFType, startY: number): number {
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);

  const text =
    "Si rilascia il presente attestato a richiesta dell'interessato/a per gli usi consentiti dalla legge.";
  const usableWidth = PAGE_W - 2 * MARGIN_X;
  const lines = doc.splitTextToSize(text, usableWidth);
  doc.text(lines, MARGIN_X, startY, { align: "justify", maxWidth: usableWidth });
  return startY + lines.length * 5.5;
}

/** Footer con luogo+data emissione a sx e firma a dx */
function drawSignature(
  doc: JsPDFType,
  studio: CertificateStudioData
): void {
  // Posizione fissa in fondo pagina (sotto firma deve poter scrivere)
  const sigY = PAGE_H - 50;
  const today = new Date();
  const city = extractCity(studio.address);
  const placeDate = city
    ? `${city}, ${fmtDateShort(today)}`
    : fmtDateShort(today);

  // Luogo + data emissione (sx)
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(placeDate, MARGIN_X, sigY);

  // Blocco firma (dx)
  const sigBlockW = 70;
  const sigBlockX = PAGE_W - MARGIN_X - sigBlockW;
  // Linea
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(sigBlockX, sigY - 1, sigBlockX + sigBlockW, sigY - 1);
  // Nome
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  const docName = studio.signature_name
    ? `Dott. ${studio.signature_name}`
    : "Il professionista";
  doc.text(docName, sigBlockX + sigBlockW / 2, sigY + 4, { align: "center" });
  // Qualifica
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
  doc.text(studio.signature_title || "", sigBlockX + sigBlockW / 2, sigY + 9, {
    align: "center",
  });
}

/** Footer pagina (FisioHub) */
function drawFooter(doc: JsPDFType, studio: CertificateStudioData): void {
  const footY = PAGE_H - 18;
  doc.setDrawColor(COLOR_BORDER[0], COLOR_BORDER[1], COLOR_BORDER[2]);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_X, footY - 4, PAGE_W - MARGIN_X, footY - 4);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 174, 192);
  doc.text("Documento generato tramite FisioHub", PAGE_W / 2, footY, {
    align: "center",
  });
  if (studio.phone || studio.email) {
    const contacts = [studio.phone, studio.email].filter(Boolean).join("  ·  ");
    doc.text(
      `Per verifiche contattare lo studio: ${contacts}`,
      PAGE_W / 2,
      footY + 4,
      { align: "center" }
    );
  }
}

// ── Filename helper ──────────────────────────────────────────────────────

function buildFilename(
  patient: CertificatePatientData,
  date: Date | null,
  variant: "single" | "multi"
): string {
  const last = patient.last_name.trim().replace(/\s+/g, "_");
  const first = patient.first_name.trim().replace(/\s+/g, "_");
  const dateStr = date
    ? date.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const suffix = variant === "single" ? "" : "_cumulativo";
  return `Attestato_presenza_${last}_${first}_${dateStr}${suffix}.pdf`;
}

// ════════════════════════════════════════════════════════════════════════
// API PUBBLICA
// ════════════════════════════════════════════════════════════════════════

/**
 * Genera e scarica un attestato di presenza per UNA SINGOLA data.
 * Usato dal modale appuntamento (calendario, desktop + mobile).
 */
export async function downloadCertificateSingle(
  data: CertificateSingleData
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const date = toDate(data.date);
  const treatmentLabel = data.treatmentLabel || "Seduta di fisioterapia";

  // Render
  let y = drawHeader(doc, data.studio);
  y = drawIntroBody(doc, y, data.studio, data.patient, "single");
  y = drawSingleDateBox(doc, y, date, treatmentLabel);
  drawClosingText(doc, y + 4);
  drawSignature(doc, data.studio);
  drawFooter(doc, data.studio);

  // Download
  doc.save(buildFilename(data.patient, date, "single"));
}

/**
 * Genera e scarica un attestato di presenza per PIÙ date.
 * Usato dalla scheda paziente (desktop + mobile).
 */
export async function downloadCertificateMulti(
  data: CertificateMultiData
): Promise<void> {
  if (!data.dates || data.dates.length === 0) {
    throw new Error("Nessuna data selezionata per l'attestato");
  }

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  // Ordino cronologicamente le date
  const normDates = data.dates
    .map((d) => ({
      date: toDate(d.date),
      treatmentLabel: d.treatmentLabel || "Fisioterapia",
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Render
  let y = drawHeader(doc, data.studio);
  y = drawIntroBody(doc, y, data.studio, data.patient, "multi");
  y = drawMultiDatesBox(doc, y, normDates);

  // Se il box di date supera lo spazio disponibile, aggiungo una nuova pagina
  // per chiusura+firma. Soglia conservativa: 230mm (sopra spazio firma).
  if (y > 230) {
    doc.addPage();
    y = 30;
  }

  drawClosingText(doc, y + 4);
  drawSignature(doc, data.studio);
  drawFooter(doc, data.studio);

  // Download
  doc.save(
    buildFilename(data.patient, normDates[0].date, "multi")
  );
}
