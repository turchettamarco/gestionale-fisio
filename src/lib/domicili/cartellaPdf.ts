// ═══════════════════════════════════════════════════════════════════════
// src/lib/domicili/cartellaPdf.ts
// ═══════════════════════════════════════════════════════════════════════
//
// PDF della cartella di valutazione Santa Lucia Life.
//
// PESO: il documento è testo vettoriale + le due firme in PNG. Le firme
// sono ritagliate e ricompresse prima di entrare (vedi trimSignature nel
// componente): il file finito sta tipicamente sotto i 150 KB, quindi non
// serve nessuna compressione a valle — è già il minimo utile.
//
// NOTA LEGALE: l'informativa estesa ex artt. 13-14 GDPR resta il foglio
// che la cooperativa consegna a parte; qui sono riportate integralmente
// le DICHIARAZIONI che il paziente sottoscrive, che la richiamano.
// ═══════════════════════════════════════════════════════════════════════

import type { Risposte } from "./cartellaSchema";
import {
  ADL, IADL, TINETTI_EQ, TINETTI_AND, MMSE_ITEMS,
  scoreBlock, scoreMmse, tinettiRischio, autonomiaLabel, mmseLabel,
} from "./cartellaSchema";

export type CartellaData = {
  // Anagrafica
  cognome: string;
  nome: string;
  data_nascita: string;
  luogo_nascita: string;
  codice_fiscale: string;
  residenza: string;
  data_valutazione: string;
  attivazione_pai: string;
  // Tutore / delegato
  tutore_nome: string;
  tutore_nascita: string;
  tutore_cf: string;
  tutore_tel: string;
  tutore_qualita: string;
  // Consenso informato
  trattamento: string;
  operatore_nome: string;
  operatore_qualifica: string;
  // Consensi GDPR (checkbox)
  consenso1: boolean;
  consenso2: boolean;
  consenso3: boolean;
  responsabilita: boolean;
  // Firme (dataURL PNG)
  firma_paziente: string;
  firma_operatore: string;
  // Scale
  risposte: Risposte;
  mmse_aggiustato: string;
  note: string;
};

const COOP = {
  nome: "Cooperativa Santa Lucia Life",
  indirizzo: "Via Leuciana 63, int. 2 — 03030 Castrocielo (FR)",
  contatti: "Tel/Fax 0776.79495 · Mobile 366.5365265 · santalucialife@libero.it",
  piva: "P.IVA 02700010602 · Iscrizione Albo n° A214381",
};

function itDate(iso: string): string {
  if (!iso) return "___/___/______";
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export async function buildCartellaPdf(d: CartellaData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const W = 210, M = 16;
  const CW = W - M * 2;
  let y = 0;

  const setFont = (size: number, style: "normal" | "bold" | "italic" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
  };

  const header = () => {
    doc.setFillColor(220, 38, 38);
    doc.rect(0, 0, W, 3, "F");
    setFont(12, "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(COOP.nome, M, 13);
    setFont(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(COOP.indirizzo, M, 17.5);
    doc.text(COOP.contatti, M, 21);
    doc.setDrawColor(226, 232, 240);
    doc.line(M, 24.5, W - M, 24.5);
    y = 32;
  };

  const footer = () => {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      setFont(7);
      doc.setTextColor(148, 163, 184);
      doc.text(COOP.piva, M, 288);
      doc.text(`Pagina ${p} di ${pages}`, W - M, 288, { align: "right" });
    }
  };

  const space = (need: number) => {
    if (y + need > 278) { doc.addPage(); header(); }
  };

  const title = (t: string) => {
    space(16);
    setFont(11, "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(t, M, y);
    y += 2;
    doc.setDrawColor(13, 148, 136);
    doc.setLineWidth(0.6);
    doc.line(M, y, M + 28, y);
    doc.setLineWidth(0.2);
    y += 6;
  };

  const para = (t: string, size = 8.5) => {
    setFont(size);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(t, CW) as string[];
    for (const ln of lines) {
      space(6);
      doc.text(ln, M, y);
      y += size * 0.46 + 1.1;
    }
    y += 1.5;
  };

  /** Riga "Etichetta: valore" con filetto sotto il valore. */
  const field = (label: string, value: string, x: number, w: number) => {
    setFont(7, "bold");
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), x, y);
    setFont(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(value || "—", x, y + 5);
    doc.setDrawColor(203, 213, 225);
    doc.line(x, y + 6.6, x + w, y + 6.6);
  };

  const fieldRow = (items: Array<[string, string]>) => {
    space(14);
    const w = (CW - (items.length - 1) * 5) / items.length;
    items.forEach(([l, v], i) => field(l, v, M + i * (w + 5), w));
    y += 12;
  };

  const checkLine = (checked: boolean, t: string) => {
    space(9);
    doc.setDrawColor(100, 116, 139);
    doc.rect(M, y - 3.2, 3.6, 3.6);
    if (checked) {
      doc.setDrawColor(13, 148, 136);
      doc.setLineWidth(0.7);
      doc.line(M + 0.7, y - 1.5, M + 1.6, y - 0.3);
      doc.line(M + 1.6, y - 0.3, M + 3, y - 2.7);
      doc.setLineWidth(0.2);
    }
    setFont(8.5);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(t, CW - 6) as string[];
    lines.forEach((ln, i) => {
      if (i > 0) space(5);
      doc.text(ln, M + 6, y + i * 4);
    });
    y += lines.length * 4 + 3;
  };

  /** Blocco firme affiancate. */
  const signatures = (labelL: string, imgL: string, labelR: string, imgR: string) => {
    space(34);
    const w = (CW - 10) / 2;
    const boxY = y;
    [[labelL, imgL, M], [labelR, imgR, M + w + 10]].forEach(([lab, img, x]) => {
      const xx = x as number;
      if (img) {
        try { doc.addImage(img as string, "PNG", xx, boxY, w, 18); } catch { /* firma illeggibile: resta il filetto */ }
      }
      doc.setDrawColor(148, 163, 184);
      doc.line(xx, boxY + 19, xx + w, boxY + 19);
      setFont(7, "bold");
      doc.setTextColor(100, 116, 139);
      doc.text((lab as string).toUpperCase(), xx, boxY + 23);
    });
    y = boxY + 29;
  };

  /** Tabella di una scala: voce + risposta scelta + punti. */
  const scaleTable = (items: Array<{ key: string; title: string; options: { label: string; value: number }[] }>, r: Risposte) => {
    for (const it of items) {
      space(12);
      const chosen = r[it.key];
      const opt = chosen === undefined
        ? null
        : it.options.find(o => o.value === chosen) ?? null;
      // il valore da solo non identifica l'opzione quando due opzioni valgono
      // uguale: si salva l'indice, quindi qui si rilegge dall'indice se c'è
      const idx = r[`${it.key}__i`];
      const shown = idx !== undefined ? it.options[idx] : opt;

      setFont(8.5, "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(it.title, M, y);
      setFont(9, "bold");
      doc.setTextColor(chosen === undefined ? 148 : 13, chosen === undefined ? 163 : 148, chosen === undefined ? 184 : 136);
      doc.text(chosen === undefined ? "—" : String(chosen), W - M, y, { align: "right" });
      y += 4;

      setFont(8);
      doc.setTextColor(71, 85, 105);
      const txt = shown ? shown.label : "non compilato";
      const lines = doc.splitTextToSize(txt, CW - 12) as string[];
      lines.forEach(ln => { space(5); doc.text(ln, M + 3, y); y += 3.8; });
      y += 2.2;
      doc.setDrawColor(241, 245, 249);
      doc.line(M, y - 1, W - M, y - 1);
      y += 1.5;
    }
  };

  const scoreBadge = (label: string, value: string, note: string, color: [number, number, number]) => {
    space(16);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.roundedRect(M, y - 4, CW, 13, 2, 2, "FD");
    setFont(8.5, "bold");
    doc.setTextColor(51, 65, 85);
    doc.text(label, M + 4, y + 2);
    setFont(13, "bold");
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(value, M + CW / 2, y + 3, { align: "center" });
    setFont(8.5, "bold");
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(note, W - M - 4, y + 2, { align: "right" });
    y += 15;
  };

  // ═══════════════ PAGINA 1 — anagrafica e consensi ═══════════════
  header();
  setFont(14, "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Cartella di valutazione assistenziale", M, y);
  y += 5;
  setFont(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Valutazione del ${itDate(d.data_valutazione)}${d.attivazione_pai ? ` · Attivazione PAI ${itDate(d.attivazione_pai)}` : ""}`, M, y);
  y += 9;

  title("Assistito");
  fieldRow([["Cognome", d.cognome], ["Nome", d.nome]]);
  fieldRow([["Nato/a il", itDate(d.data_nascita)], ["Luogo", d.luogo_nascita], ["Codice fiscale", d.codice_fiscale]]);
  fieldRow([["Residente in", d.residenza]]);

  if (d.tutore_nome) {
    title("Tutore / familiare delegato");
    fieldRow([["Nome e cognome", d.tutore_nome], ["In qualità di", d.tutore_qualita]]);
    fieldRow([["Nato/a il", itDate(d.tutore_nascita)], ["Codice fiscale", d.tutore_cf], ["Telefono", d.tutore_tel]]);
  }

  title("Consenso informato al trattamento");
  para(`Trattamento proposto: ${d.trattamento || "—"}.`);
  para(
    "Il sottoscritto dichiara di aver ricevuto informazioni chiare ed esaurienti sul trattamento sopra indicato: " +
    "sulle caratteristiche, sulle alternative terapeutiche, sui potenziali benefici, sugli eventuali rischi e complicanze. " +
    "Dichiara inoltre di aver letto e compreso il foglio informativo consegnatogli, che conferma quanto riferito verbalmente " +
    `dal sig. ${d.operatore_nome || "—"}, in qualità di ${d.operatore_qualifica || "—"}, che opera per conto della cooperativa Santa Lucia Life; ` +
    "di aver avuto l'opportunità di porre domande chiarificatrici e di aver ricevuto risposte soddisfacenti; di essere stato informato " +
    "dei motivi che consigliano il trattamento proposto e sulla qualità della propria vita in caso di rifiuto; di aver avuto tempo " +
    "sufficiente per decidere; di essere consapevole che la decisione di accettare il trattamento è volontaria e che il consenso " +
    "può essere ritirato in qualsiasi momento; che per ogni problema dovrà rivolgersi alla Cooperativa Santa Lucia Life."
  );
  para(
    "Acconsente pertanto a che venga eseguito sulla propria persona il trattamento indicato e, ai sensi del Regolamento Europeo " +
    "679/2016, autorizza la cooperativa Santa Lucia Life al trattamento dei propri dati personali esclusivamente a fini di " +
    "prevenzione, diagnosi e cura."
  );
  signatures("Firma paziente / tutore", d.firma_paziente, "Firma operatore", d.firma_operatore);

  title("Consensi ai sensi degli artt. 13-14 GDPR 2016/679");
  checkLine(d.consenso1, "CONSENSO N° 1 — Presa visione dell'informativa: autorizzo al trattamento dei miei dati ai fini dello svolgimento delle attività mediche e socio-sanitarie.");
  checkLine(d.consenso2, "CONSENSO N° 2 — In qualità di genitore/tutore legale, presto il consenso al trattamento dei dati dell'utente ai fini dello svolgimento delle attività mediche e socio-sanitarie.");
  checkLine(d.consenso3, "CONSENSO N° 3 — Autorizzo al trattamento dei miei dati per ricevere comunicazioni relative a campagne di informazione e promozione sul territorio.");
  y += 2;
  signatures("Firma di consenso", d.firma_paziente, "Data", "");
  setFont(9);
  doc.setTextColor(15, 23, 42);
  doc.text(itDate(d.data_valutazione), M + CW / 2 + 5, y - 12);

  // ═══════════════ Dichiarazione di responsabilità ═══════════════
  doc.addPage(); header();
  title("Dichiarazione di assunzione di responsabilità al trattamento");
  para(
    `Il sottoscritto ${d.tutore_nome || `${d.nome} ${d.cognome}`}, in qualità di ${d.tutore_qualita || "assistito"}, ` +
    "dichiara sotto la propria responsabilità:"
  );
  checkLine(d.responsabilita, "a) che nessun altro operatore sanitario è presente ed interviene nel trattamento previsto dal PAI;");
  checkLine(d.responsabilita, "b) di sollevare la Cooperativa Santa Lucia Life da ogni responsabilità per eventuali complicanze medico-legali derivanti dall'intervento di un altro operatore al di fuori della Cooperativa, e di segnalare tempestivamente l'eventuale presenza dello stesso.");
  y += 3;
  signatures("Firma", d.firma_paziente, "Firma operatore", d.firma_operatore);

  // ═══════════════ ADL / IADL ═══════════════
  const adl = scoreBlock(ADL, d.risposte);
  const iadl = scoreBlock(IADL, d.risposte);
  y += 4;
  title("Valutazione delle attività quotidiane");
  scoreBadge("ADL — Activity of Daily Living", `${adl} / 6`, autonomiaLabel(adl, 6), [13, 148, 136]);
  scaleTable(ADL.items, d.risposte);
  space(20);
  scoreBadge("IADL — Instrumental Activity of Daily Living", `${iadl} / 8`, autonomiaLabel(iadl, 8), [13, 148, 136]);
  scaleTable(IADL.items, d.risposte);

  // ═══════════════ MMSE ═══════════════
  doc.addPage(); header();
  const mm = scoreMmse(d.risposte);
  const mmL = mmseLabel(mm);
  title("MMSE — Mini-Mental State Examination");
  scoreBadge("Punteggio complessivo", `${mm} / 30`, mmL.label, [37, 99, 235]);
  for (const it of MMSE_ITEMS) {
    space(7);
    setFont(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(it.title, M, y);
    setFont(9, "bold");
    const v = d.risposte[it.key];
    doc.setTextColor(v === undefined ? 148 : 15, v === undefined ? 163 : 23, v === undefined ? 184 : 42);
    doc.text(`${v === undefined ? "—" : v} / ${it.max}`, W - M, y, { align: "right" });
    y += 5;
    doc.setDrawColor(241, 245, 249);
    doc.line(M, y - 1.6, W - M, y - 1.6);
  }
  y += 3;
  if (d.mmse_aggiustato) {
    para(`Punteggio aggiustato per età e scolarità: ${d.mmse_aggiustato} / 30.`);
  }
  para("Il materiale delle prove di scrittura e copia del disegno va conservato agli atti.", 7.5);

  // ═══════════════ Tinetti ═══════════════
  doc.addPage(); header();
  const eq = scoreBlock(TINETTI_EQ, d.risposte);
  const an = scoreBlock(TINETTI_AND, d.risposte);
  const tot = eq + an;
  const risk = tinettiRischio(tot);
  const rgb: [number, number, number] = risk.label === "Alto" ? [220, 38, 38] : risk.label === "Medio" ? [180, 83, 9] : [22, 163, 74];
  title("Scala Tinetti — equilibrio e andatura");
  scoreBadge("Totale", `${tot} / 28`, `Rischio di cadute: ${risk.label}`, rgb);
  para(`Equilibrio ${eq}/16 · Andatura ${an}/12 — soglie: ≤18 rischio alto, 19-24 medio, ≥25 basso.`, 8);
  y += 1;
  setFont(9.5, "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Equilibrio", M, y); y += 5;
  scaleTable(TINETTI_EQ.items, d.risposte);
  space(14);
  setFont(9.5, "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Andatura", M, y); y += 5;
  scaleTable(TINETTI_AND.items, d.risposte);

  if (d.note.trim()) {
    space(24);
    title("Note");
    para(d.note);
  }

  space(34);
  signatures("Firma operatore", d.firma_operatore, "Data", "");
  setFont(9);
  doc.setTextColor(15, 23, 42);
  doc.text(itDate(d.data_valutazione), M + CW / 2 + 5, y - 12);

  footer();
  return doc.output("blob");
}

/** Nome file leggibile e ordinabile. */
export function cartellaFileName(d: Pick<CartellaData, "cognome" | "nome" | "data_valutazione">): string {
  const slug = `${d.cognome}_${d.nome}`.replace(/[^A-Za-zÀ-ÿ0-9]+/g, "_").replace(/^_|_$/g, "") || "paziente";
  return `Valutazione_${slug}_${d.data_valutazione || "senza-data"}.pdf`;
}
