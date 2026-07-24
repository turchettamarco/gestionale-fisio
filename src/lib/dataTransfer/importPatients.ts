// src/lib/dataTransfer/importPatients.ts
// ═══════════════════════════════════════════════════════════════════════
// Import anagrafiche pazienti da un file qualsiasi.
//
// IMPOSTAZIONE:
// Non conosce il formato di nessun gestionale, e non deve conoscerlo. Ogni
// concorrente esporta a modo suo e i formati cambiano nel tempo: un import
// che sa leggere "il file di OsteoEasy" smette di funzionare al primo
// aggiornamento. Qui si legge qualunque .csv o .xlsx, si mostrano le
// colonne trovate, e la corrispondenza la decide chi importa.
//
// Un riconoscimento automatico c'è, ma è solo un suggerimento di partenza:
// propone gli abbinamenti ovvi e lascia correggere tutto.
//
// NIENTE SCRITTURE AL BUIO: prima si vede l'anteprima con i problemi
// segnalati, poi si conferma. I doppioni si riconoscono su codice fiscale,
// oppure su cognome+nome+data di nascita.
// ═══════════════════════════════════════════════════════════════════════

import * as XLSX from "xlsx";

/** Campi del paziente che si possono popolare da un file. */
export type CampoPaziente =
  | "last_name" | "first_name" | "phone" | "email" | "birth_date"
  | "birth_place" | "tax_code" | "res_address" | "res_city" | "res_cap"
  | "res_province" | "occupation" | "sport" | "anamnesis" | "note";

export const CAMPI: Array<{ id: CampoPaziente; label: string; obbligatorio?: boolean }> = [
  { id: "last_name",   label: "Cognome", obbligatorio: true },
  { id: "first_name",  label: "Nome" },
  { id: "phone",       label: "Telefono" },
  { id: "email",       label: "Email" },
  { id: "birth_date",  label: "Data di nascita" },
  { id: "birth_place", label: "Luogo di nascita" },
  { id: "tax_code",    label: "Codice fiscale" },
  { id: "res_address", label: "Indirizzo" },
  { id: "res_city",    label: "Città" },
  { id: "res_cap",     label: "CAP" },
  { id: "res_province",label: "Provincia" },
  { id: "occupation",  label: "Professione" },
  { id: "sport",       label: "Sport" },
  { id: "anamnesis",   label: "Anamnesi / note cliniche" },
];

/** Parole che, trovate nell'intestazione, suggeriscono il campo. */
const INDIZI: Record<CampoPaziente, string[]> = {
  last_name:   ["cognome", "lastname", "last name", "surname"],
  first_name:  ["nome", "firstname", "first name", "name"],
  phone:       ["telefono", "cellulare", "cell", "phone", "mobile", "tel"],
  email:       ["email", "e-mail", "mail", "posta"],
  birth_date:  ["nascita", "birth", "nato", "data nascita", "dob"],
  birth_place: ["luogo", "comune di nascita", "birthplace"],
  tax_code:    ["fiscale", "cf", "codice fiscale", "tax"],
  res_address: ["indirizzo", "via", "address", "residenza"],
  res_city:    ["citta", "città", "comune", "city", "localita", "località"],
  res_cap:     ["cap", "zip", "postale"],
  res_province:["provincia", "prov", "province"],
  occupation:  ["professione", "lavoro", "occupazione", "job"],
  sport:       ["sport", "attivita", "attività"],
  anamnesis:   ["anamnesi", "note", "storia", "notes"],
  note:        [],
};

export type FileLetto = {
  intestazioni: string[];
  righe: string[][];
  nomeFoglio?: string;
};

/** Legge .xlsx, .xls o .csv. Il separatore del CSV viene dedotto. */
export async function leggiFile(file: File): Promise<FileLetto> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", raw: false, cellDates: false });
  const nomeFoglio = wb.SheetNames[0];
  if (!nomeFoglio) throw new Error("Il file non contiene fogli leggibili.");

  const ws = wb.Sheets[nomeFoglio];
  const matrice = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1, defval: "", blankrows: false, raw: false,
  });

  if (matrice.length === 0) throw new Error("Il file è vuoto.");

  // Prima riga non vuota = intestazioni
  const primaUtile = matrice.findIndex(r => r.some(c => String(c).trim() !== ""));
  if (primaUtile < 0) throw new Error("Non trovo righe con contenuto.");

  const intestazioni = (matrice[primaUtile] as unknown[]).map((h, i) => {
    const t = String(h ?? "").trim();
    return t || `Colonna ${i + 1}`;
  });

  const righe = matrice.slice(primaUtile + 1)
    .map(r => intestazioni.map((_, i) => String((r as unknown[])[i] ?? "").trim()))
    .filter(r => r.some(c => c !== ""));

  return { intestazioni, righe, nomeFoglio };
}

/** Propone un abbinamento colonna → campo. Solo un punto di partenza. */
export function suggerisciMappatura(intestazioni: string[]): Record<number, CampoPaziente | ""> {
  const mappa: Record<number, CampoPaziente | ""> = {};
  const usati = new Set<CampoPaziente>();

  intestazioni.forEach((h, i) => {
    const norm = h.toLowerCase().trim();
    let scelto: CampoPaziente | "" = "";
    let punteggio = 0;

    for (const campo of Object.keys(INDIZI) as CampoPaziente[]) {
      if (usati.has(campo)) continue;
      for (const indizio of INDIZI[campo]) {
        // Corrispondenza esatta vale più di una parziale: evita che
        // "Comune di nascita" finisca su Città solo perché contiene "comune"
        const p = norm === indizio ? 3 : norm.includes(indizio) ? 1 : 0;
        if (p > punteggio) { punteggio = p; scelto = campo; }
      }
    }
    if (scelto && punteggio > 0) { mappa[i] = scelto; usati.add(scelto); }
    else mappa[i] = "";
  });

  return mappa;
}

/** Riconosce le date scritte all'italiana, all'americana o come numero Excel. */
export function normalizzaData(v: string): string | null {
  const s = v.trim();
  if (!s) return null;

  // Numero seriale Excel (giorni dal 30/12/1899)
  if (/^\d{5}$/.test(s)) {
    const ms = (Number(s) - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // Già in formato ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // gg/mm/aaaa oppure gg-mm-aaaa
  const it = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (it) {
    const [, g, m] = it;
    let a = it[3];
    if (a.length === 2) a = Number(a) > 30 ? `19${a}` : `20${a}`;
    const gg = g.padStart(2, "0"), mm = m.padStart(2, "0");
    // Oltre 12 nel campo mese: era in formato americano
    if (Number(mm) > 12 && Number(gg) <= 12) return `${a}-${gg}-${mm}`;
    return `${a}-${mm}-${gg}`;
  }

  return null;
}

export type RigaImport = {
  numero: number;
  valori: Partial<Record<CampoPaziente, string>>;
  problemi: string[];
  /** true = si scarta: manca il cognome o è un doppione nel file */
  scarta: boolean;
};

export type Anteprima = {
  righe: RigaImport[];
  valide: number;
  scartate: number;
  conAvvisi: number;
};

/**
 * Applica la mappatura e controlla i dati PRIMA di scrivere.
 * `esistenti` serve a segnalare chi c'è già in archivio.
 */
export function preparaAnteprima(
  file: FileLetto,
  mappa: Record<number, CampoPaziente | "">,
  esistenti: Array<{ tax_code?: string | null; last_name?: string | null; first_name?: string | null; birth_date?: string | null }>
): Anteprima {

  const cfEsistenti = new Set(
    esistenti.map(e => (e.tax_code ?? "").trim().toUpperCase()).filter(Boolean)
  );
  const nominativiEsistenti = new Set(
    esistenti.map(e => `${(e.last_name ?? "").trim().toLowerCase()}|${(e.first_name ?? "").trim().toLowerCase()}|${e.birth_date ?? ""}`)
  );

  const cfNelFile = new Set<string>();
  const nominativiNelFile = new Set<string>();
  const righe: RigaImport[] = [];

  file.righe.forEach((r, idx) => {
    const valori: Partial<Record<CampoPaziente, string>> = {};
    const problemi: string[] = [];

    Object.entries(mappa).forEach(([colStr, campo]) => {
      if (!campo) return;
      const v = (r[Number(colStr)] ?? "").trim();
      if (v) valori[campo] = v;
    });

    // Data: si normalizza o si segnala, mai si tira a indovinare
    if (valori.birth_date) {
      const d = normalizzaData(valori.birth_date);
      if (d) valori.birth_date = d;
      else { problemi.push(`data di nascita non riconosciuta: "${valori.birth_date}"`); delete valori.birth_date; }
    }

    if (valori.tax_code) {
      const cf = valori.tax_code.toUpperCase().replace(/\s/g, "");
      valori.tax_code = cf;
      if (cf.length !== 16) problemi.push("codice fiscale di lunghezza anomala");
    }

    if (valori.phone) {
      valori.phone = valori.phone.replace(/[^\d+]/g, "");
      if (valori.phone.replace(/\D/g, "").length < 6) problemi.push("telefono troppo corto");
    }

    if (valori.email && !valori.email.includes("@")) {
      problemi.push("email senza @");
      delete valori.email;
    }

    let scarta = false;

    if (!valori.last_name) {
      problemi.push("manca il cognome: riga saltata");
      scarta = true;
    }

    const cf = (valori.tax_code ?? "").toUpperCase();
    const nominativo = `${(valori.last_name ?? "").toLowerCase()}|${(valori.first_name ?? "").toLowerCase()}|${valori.birth_date ?? ""}`;

    if (cf && cfNelFile.has(cf)) { problemi.push("ripetuto nel file stesso"); scarta = true; }
    else if (cf) cfNelFile.add(cf);

    if (!cf && nominativoValido(valori) && nominativiNelFile.has(nominativo)) {
      problemi.push("ripetuto nel file stesso"); scarta = true;
    } else if (!cf) nominativiNelFile.add(nominativo);

    if (!scarta) {
      if (cf && cfEsistenti.has(cf)) { problemi.push("già presente in archivio (stesso codice fiscale)"); scarta = true; }
      else if (nominativiExists(nominativiEsistenti, valori, nominativo)) {
        problemi.push("già presente in archivio (stesso nome e data di nascita)"); scarta = true;
      }
    }

    righe.push({ numero: idx + 1, valori, problemi, scarta });
  });

  return {
    righe,
    valide: righe.filter(r => !r.scarta).length,
    scartate: righe.filter(r => r.scarta).length,
    conAvvisi: righe.filter(r => !r.scarta && r.problemi.length > 0).length,
  };
}

function nominativoValido(v: Partial<Record<CampoPaziente, string>>): boolean {
  return Boolean(v.last_name && v.first_name && v.birth_date);
}

function nominativiExists(
  set: Set<string>,
  v: Partial<Record<CampoPaziente, string>>,
  chiave: string
): boolean {
  // Senza data di nascita il confronto su nome e cognome darebbe troppi
  // falsi positivi: due "Rossi Mario" diversi esistono davvero.
  return nominativoValido(v) && set.has(chiave);
}
