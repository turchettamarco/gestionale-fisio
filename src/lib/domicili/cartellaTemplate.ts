// ═══════════════════════════════════════════════════════════════════════
// src/lib/domicili/cartellaTemplate.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Compila il modulo ORIGINALE della Cooperativa Santa Lucia Life.
//
// Non ridisegna nulla: carica public/cartella-santa-lucia.pdf e ci scrive
// sopra: loghi, banner rossi, impaginazione, certificazioni e persino i
// refusi restano quelli del cartaceo. Il documento che esce è identico a
// quello che si stamperebbe, con le risposte già dentro.
//
// COME SEGNA LE RISPOSTE
//   • scale ADL/IADL/Tinetti → evidenziatore semitrasparente sulla riga
//     scelta (non copre il testo, si legge anche stampato in bianco e nero
//     grazie al segno di spunta affiancato);
//   • MMSE → cerchio attorno alla parentesi del punteggio, come si farebbe
//     a penna;
//   • firme → la firma del paziente viene riportata su TUTTI i punti firma
//     (consenso informato, consensi n° 1/2/3, dichiarazione di
//     responsabilità), quella dell'operatore dove previsto.
// ═══════════════════════════════════════════════════════════════════════

import type { Risposte } from "./cartellaSchema";
import {
  ADL, IADL, TINETTI_EQ, TINETTI_AND, MMSE_ITEMS,
  scoreBlock, scoreMmse,
} from "./cartellaSchema";
import {
  PAGINA, ALTEZZA, CAMPI_CONSENSO, FIRME_CONSENSO, CONSENSI_GDPR,
  CAMPI_RESPONSABILITA, INTESTAZIONI, TOTALI, RISCHIO_TINETTI,
  OPZIONI_ADL, OPZIONI_IADL, OPZIONI_TINETTI_EQ, OPZIONI_TINETTI_AND,
  PARENTESI_MMSE,
} from "./cartellaCoords";
import type { CartellaData } from "./cartellaPdf";

/** Percorso del modulo vuoto servito come asset statico. */
const TEMPLATE_URL = "/cartella-santa-lucia.pdf";

/** Estensione orizzontale delle colonne, per l'evidenziatore. */
const COLONNE = {
  adl: [13.2, 293.2],
  iadl: [300.1, 578.5],
  teq: [44.0, 296.0],
  tand: [300.0, 552.0],
} as const;

function itDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export async function compilaModuloOriginale(d: CartellaData): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) {
    throw new Error(
      "Modulo originale non trovato (public/cartella-santa-lucia.pdf). " +
      "Verifica che il file sia stato distribuito con l'applicazione."
    );
  }
  const pdf = await PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pagine = pdf.getPages();

  const INK = rgb(0.06, 0.20, 0.45);        // blu penna
  const MARK = rgb(0.02, 0.55, 0.50);       // verde-teal dei segni
  const HL = rgb(0.55, 0.92, 0.86);         // evidenziatore

  /** Testo su un campo: y calcolato dal `top` del modulo. */
  const scrivi = (
    pageIdx: number, x: number, top: number, testo: string,
    opt: { size?: number; max?: number; bold?: boolean } = {}
  ) => {
    if (!testo) return;
    const pg = pagine[pageIdx];
    if (!pg) return;
    let size = opt.size ?? 10.5;
    const f = opt.bold ? fontB : font;
    // testo pulito: Helvetica standard non ha i caratteri fuori WinAnsi
    const s = testo.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[^\x20-\xFF]/g, "");
    if (opt.max) {
      while (size > 6 && f.widthOfTextAtSize(s, size) > opt.max) size -= 0.4;
    }
    pg.drawText(s, { x, y: ALTEZZA - top - 9.5, size, font: f, color: INK });
  };

  /** Evidenzia la riga di un'opzione e ci mette accanto il segno di spunta. */
  const evidenzia = (pageIdx: number, top: number, x0: number, x1: number) => {
    const pg = pagine[pageIdx];
    if (!pg) return;
    pg.drawRectangle({
      x: x0, y: ALTEZZA - top - 11.5, width: x1 - x0, height: 13.5,
      color: HL, opacity: 0.42,
    });
    pg.drawText("v", {
      x: x1 - 9, y: ALTEZZA - top - 9, size: 9, font: fontB, color: MARK,
    });
  };

  /** Cerchio attorno a una parentesi MMSE. */
  const cerchia = (pageIdx: number, top: number, bx0: number, bx1: number) => {
    const pg = pagine[pageIdx];
    if (!pg) return;
    pg.drawEllipse({
      x: (bx0 + bx1) / 2, y: ALTEZZA - top - 5.5,
      xScale: (bx1 - bx0) / 2 + 2.2, yScale: 7.2,
      borderColor: MARK, borderWidth: 1.3, opacity: 0,
    });
  };

  /** Firma PNG sopra una riga, adattata allo spazio disponibile. */
  const firma = async (pageIdx: number, dataUrl: string, x0: number, x1: number, topRiga: number) => {
    if (!dataUrl?.startsWith("data:image/png")) return;
    const pg = pagine[pageIdx];
    if (!pg) return;
    try {
      const png = await pdf.embedPng(dataUrl);
      const maxW = Math.min(x1 - x0, 170);
      const maxH = 26;
      const s = Math.min(maxW / png.width, maxH / png.height);
      const w = png.width * s, h = png.height * s;
      pg.drawImage(png, { x: x0 + 4, y: ALTEZZA - topRiga - h + 2, width: w, height: h });
    } catch {
      // firma illeggibile: resta la riga vuota da firmare a mano
    }
  };

  // ═══════════ p3 — Consenso informato ═══════════
  {
    const P = PAGINA.consenso, C = CAMPI_CONSENSO;
    scrivi(P, C.trattamentoTitolo[0], C.trattamentoTitolo[1], d.trattamento, { max: C.trattamentoTitolo[2] });
    scrivi(P, C.sottoscritto[0], C.sottoscritto[1], `${d.cognome} ${d.nome}`.trim(), { max: C.sottoscritto[2] });
    scrivi(P, C.natoIl[0], C.natoIl[1], itDate(d.data_nascita), { size: 9.5, max: C.natoIl[2] });
    scrivi(P, C.luogo[0], C.luogo[1], d.luogo_nascita, { max: C.luogo[2] });
    scrivi(P, C.cf[0], C.cf[1], d.codice_fiscale, { max: C.cf[2] });
    scrivi(P, C.residente[0], C.residente[1], d.residenza, { max: C.residente[2] });
    scrivi(P, C.tutore[0], C.tutore[1], d.tutore_nome, { max: C.tutore[2] });
    scrivi(P, C.tutoreNatoIl[0], C.tutoreNatoIl[1], itDate(d.tutore_nascita), { size: 9.5, max: C.tutoreNatoIl[2] });
    scrivi(P, C.tutoreCf[0], C.tutoreCf[1], d.tutore_cf, { max: C.tutoreCf[2] });
    scrivi(P, C.tutoreTel[0], C.tutoreTel[1], d.tutore_tel, { max: C.tutoreTel[2] });
    scrivi(P, C.operatoreNome[0], C.operatoreNome[1], d.operatore_nome, { max: C.operatoreNome[2] });
    scrivi(P, C.operatoreQualifica[0], C.operatoreQualifica[1], d.operatore_qualifica, { max: C.operatoreQualifica[2] });
    scrivi(P, C.trattamentoFinale[0], C.trattamentoFinale[1], d.trattamento, { max: C.trattamentoFinale[2] });
    await firma(P, d.firma_operatore, FIRME_CONSENSO.operatore[0], FIRME_CONSENSO.operatore[1], FIRME_CONSENSO.operatore[2]);
    await firma(P, d.firma_paziente, FIRME_CONSENSO.paziente[0], FIRME_CONSENSO.paziente[1], FIRME_CONSENSO.paziente[2]);
    scrivi(P, FIRME_CONSENSO.data[0], FIRME_CONSENSO.data[1], itDate(d.data_valutazione), { bold: true });
  }

  // ═══════════ p5 — Consensi GDPR ═══════════
  {
    const P = PAGINA.consensiGdpr;
    const nomeUtente = `${d.nome} ${d.cognome}`.trim();
    const riga = async (
      box: readonly [number, number, number, number], nome: string, firmaUrl: string
    ) => {
      const [xn, xf, top, bot] = box;
      const mid = top + (bot - top) / 2 - 4;
      scrivi(P, xn + 12, mid, nome, { max: xf - xn - 20 });
      await firma(P, firmaUrl, xf, xf + 200, bot - 6);
    };
    if (d.consenso1) await riga(CONSENSI_GDPR.n1, nomeUtente, d.firma_paziente);
    if (d.consenso2) await riga(CONSENSI_GDPR.n2Tutore, d.tutore_nome || nomeUtente, d.firma_paziente);
    if (d.consenso3) await riga(CONSENSI_GDPR.n3, nomeUtente, d.firma_paziente);
  }

  // ═══════════ p7 — Dichiarazione di responsabilità ═══════════
  if (d.responsabilita) {
    const P = PAGINA.responsabilita, C = CAMPI_RESPONSABILITA;
    scrivi(P, C.attivazionePai[0], C.attivazionePai[1], itDate(d.attivazione_pai), { size: 9, max: 48 });
    scrivi(P, C.assistito[0], C.assistito[1], `${d.nome} ${d.cognome}`.trim(), { max: C.assistito[2] });
    scrivi(P, C.assistitoNatoIl[0], C.assistitoNatoIl[1], itDate(d.data_nascita), { size: 9, max: 48 });
    scrivi(P, C.sottoscritto[0], C.sottoscritto[1], d.tutore_nome || `${d.nome} ${d.cognome}`.trim(), { max: C.sottoscritto[2] });
    scrivi(P, C.luogoNascita[0], C.luogoNascita[1], d.luogo_nascita, { max: C.luogoNascita[2] });
    scrivi(P, C.dataNascita[0], C.dataNascita[1], itDate(d.tutore_nascita || d.data_nascita), { size: 9, max: 48 });
    scrivi(P, C.data[0], C.data[1], itDate(d.data_valutazione), { size: 9, max: 48 });
    await firma(P, d.firma_paziente, C.firma[0], C.firma[0] + C.firma[2], C.firma[1] + 10);
  }

  // ═══════════ p9 — ADL e IADL ═══════════
  {
    const P = PAGINA.adlIadl, H = INTESTAZIONI.adlIadl;
    scrivi(P, H.nome[0], H.nome[1], d.nome, { max: H.nome[2] });
    scrivi(P, H.cognome[0], H.cognome[1], d.cognome, { max: H.cognome[2] });
    scrivi(P, H.nascita[0], H.nascita[1], itDate(d.data_nascita), { size: 9.5, max: H.nascita[2] });
    scrivi(P, H.valutaz[0], H.valutaz[1], itDate(d.data_valutazione), { size: 9.5, max: H.valutaz[2] });

    // Le opzioni sono in ordine di documento: si scorre lo schema nello
    // stesso ordine e si consuma un indice per volta.
    let k = 0;
    for (const it of ADL.items) {
      for (let i = 0; i < it.options.length; i++, k++) {
        if (d.risposte[`${it.key}__i`] === i && OPZIONI_ADL[k]) {
          evidenzia(P, OPZIONI_ADL[k][0], COLONNE.adl[0], COLONNE.adl[1]);
        }
      }
    }
    k = 0;
    for (const it of IADL.items) {
      for (let i = 0; i < it.options.length; i++, k++) {
        if (d.risposte[`${it.key}__i`] === i && OPZIONI_IADL[k]) {
          evidenzia(P, OPZIONI_IADL[k][0], COLONNE.iadl[0], COLONNE.iadl[1]);
        }
      }
    }
    scrivi(P, TOTALI.adl[0], TOTALI.adl[1], String(scoreBlock(ADL, d.risposte)), { bold: true, size: 12 });
    scrivi(P, TOTALI.iadl[0], TOTALI.iadl[1], String(scoreBlock(IADL, d.risposte)), { bold: true, size: 12 });
  }

  // ═══════════ p11 — MMSE ═══════════
  {
    const P = PAGINA.mmse, H = INTESTAZIONI.mmse;
    scrivi(P, H.nome[0], H.nome[1], d.nome, { max: H.nome[2] });
    scrivi(P, H.cognome[0], H.cognome[1], d.cognome, { max: H.cognome[2] });
    scrivi(P, H.nascita[0], H.nascita[1], itDate(d.data_nascita), { size: 9.5, max: H.nascita[2] });
    scrivi(P, H.valutaz[0], H.valutaz[1], itDate(d.data_valutazione), { size: 9.5, max: H.valutaz[2] });

    MMSE_ITEMS.forEach((it, idx) => {
      const riga = PARENTESI_MMSE[idx];
      const v = d.risposte[it.key];
      if (!riga || v === undefined) return;
      const br = riga[1][v];
      if (br) cerchia(P, riga[0], br[0], br[1]);
    });
    scrivi(P, TOTALI.mmseGrezzo[0], TOTALI.mmseGrezzo[1], String(scoreMmse(d.risposte)), { bold: true, size: 11 });
    if (d.mmse_aggiustato) {
      scrivi(P, TOTALI.mmseAggiust[0], TOTALI.mmseAggiust[1], d.mmse_aggiustato, { bold: true, size: 11 });
    }
  }

  // ═══════════ p13 — Tinetti ═══════════
  {
    const P = PAGINA.tinetti, H = INTESTAZIONI.tinetti;
    scrivi(P, H.nome[0], H.nome[1], d.nome, { max: H.nome[2] });
    scrivi(P, H.cognome[0], H.cognome[1], d.cognome, { max: H.cognome[2] });
    scrivi(P, H.nascita[0], H.nascita[1], itDate(d.data_nascita), { size: 9.5, max: H.nascita[2] });
    scrivi(P, H.valutaz[0], H.valutaz[1], itDate(d.data_valutazione), { size: 9.5, max: H.valutaz[2] });

    let k = 0;
    for (const it of TINETTI_EQ.items) {
      for (let i = 0; i < it.options.length; i++, k++) {
        if (d.risposte[`${it.key}__i`] === i && OPZIONI_TINETTI_EQ[k]) {
          evidenzia(P, OPZIONI_TINETTI_EQ[k][0], COLONNE.teq[0], COLONNE.teq[1]);
        }
      }
    }
    k = 0;
    for (const it of TINETTI_AND.items) {
      for (let i = 0; i < it.options.length; i++, k++) {
        if (d.risposte[`${it.key}__i`] === i && OPZIONI_TINETTI_AND[k]) {
          evidenzia(P, OPZIONI_TINETTI_AND[k][0], COLONNE.tand[0], COLONNE.tand[1]);
        }
      }
    }
    const eq = scoreBlock(TINETTI_EQ, d.risposte);
    const an = scoreBlock(TINETTI_AND, d.risposte);
    scrivi(P, TOTALI.tinettiEq[0], TOTALI.tinettiEq[1], String(eq), { bold: true, size: 11 });
    scrivi(P, TOTALI.tinettiAnd[0], TOTALI.tinettiAnd[1], String(an), { bold: true, size: 11 });

    // Fascia di rischio evidenziata nella tabella in fondo
    const tot = eq + an;
    const riga = tot <= 18 ? RISCHIO_TINETTI.alto : tot <= 24 ? RISCHIO_TINETTI.medio : RISCHIO_TINETTI.basso;
    if (tot > 0) evidenzia(P, riga[0], riga[1], riga[2]);
  }

  const bytes = await pdf.save({ useObjectStreams: true });
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}
