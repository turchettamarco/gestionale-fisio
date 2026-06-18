// src/lib/contabilita/tsExport.ts
// ═══════════════════════════════════════════════════════════════════════
// Helpers per la preparazione e l'export dei dati di spesa al Sistema TS.
//
// Cosa fa QUESTO modulo (Fase 2a):
// - calcola i valori "effettivi" di ogni spesa (tipo spesa, opposizione,
//   flag pagamento tracciato) combinando seduta + paziente + default;
// - serializza in CSV leggibile, pronto per revisione e per l'import nel
//   portale / strumenti del commercialista.
//
// Cosa NON fa ancora (step 2a-bis, da fare sul tracciato XSD ufficiale):
// - generazione dell'XML conforme all'XSD del Sistema TS e
//   cifratura/trasmissione via web service SOGES. Il CSV qui sotto e' il
//   layer dati: la serializzazione XML si aggancera' senza toccare la UI.
// ═══════════════════════════════════════════════════════════════════════

export type SpesaPatient = {
  first_name: string | null;
  last_name: string | null;
  tax_code: string | null;
  ts_opposizione: boolean | null;
};

export type SpesaRow = {
  id: string;
  patient_id: string | null;
  paid_at: string | null;
  session_at: string | null;
  amount: number | null;
  payment_method: string | null;       // 'cash' | 'pos' | 'bank_transfer' | null
  price_type: string | null;           // 'invoiced' (fatturata) | 'cash' | null
  ts_exclude: boolean | null;
  ts_tipo_spesa: string | null;
  ts_opposizione: boolean | null;
  ts_doc_number: number | null;
  ts_doc_ref: string | null;
  ts_doc_year: number | null;
  ts_doc_date: string | null;           // 'YYYY-MM-DD'
  ts_sent_at: string | null;
  ts_protocollo?: string | null;
  ts_esito?: string | null;
  patient: SpesaPatient | null;
};

/** POS e bonifico = tracciabili (spesa detraibile). Contante = non tracciato. */
export function isPagamentoTracciato(pm: string | null | undefined): boolean {
  return pm === "pos" || pm === "bank_transfer";
}

/** Etichetta leggibile del metodo di pagamento. */
export function paymentLabel(pm: string | null | undefined): string {
  if (pm === "pos") return "POS";
  if (pm === "bank_transfer") return "Bonifico";
  if (pm === "cash") return "Contanti";
  return "—";
}

export function effectiveTipoSpesa(row: SpesaRow, defaultCode: string): string {
  return (row.ts_tipo_spesa && row.ts_tipo_spesa.trim()) || defaultCode || "SP";
}

/** Opposizione effettiva = override seduta OR preferenza permanente paziente. */
export function effectiveOpposizione(row: SpesaRow): boolean {
  return Boolean(row.ts_opposizione) || Boolean(row.patient?.ts_opposizione);
}

export function patientFullName(p: SpesaPatient | null): string {
  if (!p) return "";
  return [p.last_name, p.first_name].filter(Boolean).join(" ").trim();
}

/** Numero documento "ufficiale": testo (Xolo) se presente, altrimenti il progressivo. */
export function docNumber(r: SpesaRow): string {
  if (r.ts_doc_ref && r.ts_doc_ref.trim()) return r.ts_doc_ref.trim();
  return r.ts_doc_number != null ? String(r.ts_doc_number) : "";
}

export function hasDocNumber(r: SpesaRow): boolean {
  return docNumber(r) !== "";
}

function formatDateITA(ymd: string | null): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function formatImporto(n: number | null): string {
  const v = typeof n === "number" ? n : 0;
  return v.toFixed(2).replace(".", ",");
}

function csvCell(s: string): string {
  // Escape per CSV: raddoppia le virgolette, racchiude tra virgolette.
  return `"${(s ?? "").replace(/"/g, '""')}"`;
}

/**
 * Costruisce il CSV dei dati di spesa (separatore ; — convenzione italiana).
 * Include un BOM UTF-8 cosi' Excel apre correttamente gli accenti.
 */
export function buildTsCsv(rows: SpesaRow[], defaultTipoSpesa: string): string {
  const header = [
    "Numero documento",
    "Data documento",
    "Codice fiscale",
    "Paziente",
    "Tipo spesa",
    "Importo",
    "Pagamento tracciato",
    "Opposizione",
  ]
    .map(csvCell)
    .join(";");

  const lines = Array.from(
    rows.reduce((m, r) => {
      const key = `${docNumber(r)}||${(r.patient?.tax_code || "").toUpperCase()}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
      return m;
    }, new Map<string, SpesaRow[]>()).values()
  ).map((g) => {
    // Una stessa fattura può coprire PIÙ sedute: si aggregano in un'unica riga
    // col totale sommato (regola Sistema TS: 1 documento = 1 riga).
    const first = g[0];
    const totale = g.reduce((s, r) => s + (r.amount ?? 0), 0);
    const tracciato = g.every((r) => isPagamentoTracciato(r.payment_method));
    const opposizione = g.some((r) => effectiveOpposizione(r));
    return [
      docNumber(first),
      formatDateITA(first.ts_doc_date),
      (first.patient?.tax_code || "").toUpperCase(),
      patientFullName(first.patient),
      effectiveTipoSpesa(first, defaultTipoSpesa),
      formatImporto(totale),
      tracciato ? "SI" : "NO",
      opposizione ? "SI" : "NO",
    ]
      .map((c) => csvCell(String(c)))
      .join(";");
  });

  return "\uFEFF" + [header, ...lines].join("\r\n");
}

/** Avvia il download di un file di testo nel browser. */
export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
