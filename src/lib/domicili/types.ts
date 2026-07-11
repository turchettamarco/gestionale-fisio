// ═══════════════════════════════════════════════════════════════════════
// src/lib/domicili/types.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Tipi e helper condivisi della sezione "Domicili Cooperative".
//
// PRINCIPIO: tutto ciò che sta qui è AUTONOMO — nessun import dai tipi
// di patients/appointments. La sezione vive in un mondo suo (mig. 055).
// ═══════════════════════════════════════════════════════════════════════

// ─── Tipi DB ──────────────────────────────────────────────────────────

export type Cooperative = {
  id: string;
  studio_id: string;
  nome: string;
  logo_url: string | null;
  colore: string;
  attiva: boolean;
  created_at: string;
};

/** Giorno fisso settimanale con orario opzionale. dow: 1=LUN … 6=SAB */
export type GiornoOrario = { dow: number; orario: string | null };

export type CoopPatientStato = "attivo" | "sospeso" | "concluso";

export type CoopPatient = {
  id: string;
  studio_id: string;
  cooperative_id: string;

  cognome: string;
  nome: string;
  data_nascita: string | null;   // YYYY-MM-DD
  residenza: string | null;
  citta: string | null;
  distretto: string | null;
  recapiti: string | null;
  diagnosi: string | null;

  data_arrivo: string | null;
  data_attivazione: string | null;
  data_scadenza: string | null;

  prestazione: string;
  frequenza_settimanale: number | null;
  tot_accessi: number | null;
  operatori: string | null;

  giorni_orari: GiornoOrario[];
  note: string | null;
  stato: CoopPatientStato;
  created_at: string;
  updated_at: string;
};

export type CoopAccessStato = "pianificato" | "fatto" | "saltato";

export type CoopAccess = {
  id: string;
  studio_id: string;
  coop_patient_id: string;
  data: string;                  // YYYY-MM-DD
  orario: string | null;         // "HH:MM" (normalizzato) | null
  stato: CoopAccessStato;
  fatto_alle: string | null;
  note: string | null;
};

export type CounterMode = "manuale" | "automatico";

// ─── Costanti UI ──────────────────────────────────────────────────────

/** Etichette giorni, indice = dow (1=LUN … 6=SAB). Indice 0 inutilizzato. */
export const DOW_LABELS = ["", "LUN", "MAR", "MER", "GIO", "VEN", "SAB"] as const;
export const DOW_LABELS_FULL = ["", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"] as const;

/** Preset logo/colore per la creazione rapida delle cooperative note. */
export const COOP_PRESETS: { nome: string; logo_url: string; colore: string }[] = [
  { nome: "Santa Lucia", logo_url: "/coop-logos/santa-lucia.png", colore: "#dc2626" },
  { nome: "CRN",         logo_url: "/coop-logos/crn.png",         colore: "#1d3d4f" },
];

export const COOP_COLOR_CHOICES = [
  "#dc2626", "#1d3d4f", "#0d9488", "#2563eb", "#7c3aed", "#f59e0b", "#16a34a", "#64748b",
];

// ─── Date helper (locali, senza fusi) ─────────────────────────────────

/** Data locale → "YYYY-MM-DD" (senza sorprese di timezone). */
export function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" → Date locale (mezzogiorno per evitare shift DST). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Lunedì della settimana che contiene d. */
export function mondayOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  const jsDay = out.getDay();           // 0=dom … 6=sab
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  return addDays(out, diff);
}

/** dow interno (1=LUN … 7=DOM) di una Date. */
export function dowOf(d: Date): number {
  const jsDay = d.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

const MESI_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** "6 lug" */
export function fmtShort(d: Date): string {
  return `${d.getDate()} ${MESI_SHORT[d.getMonth()]}`;
}

/** "YYYY-MM-DD" → "dd/mm/yyyy" ("" se nullo). */
export function fmtIT(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Range settimana "6 – 11 luglio 2026" a partire dal lunedì. */
export function fmtWeekRange(monday: Date): string {
  const sab = addDays(monday, 5);
  const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  if (monday.getMonth() === sab.getMonth()) {
    return `${monday.getDate()} – ${sab.getDate()} ${MESI[sab.getMonth()]} ${sab.getFullYear()}`;
  }
  return `${monday.getDate()} ${MESI[monday.getMonth()]} – ${sab.getDate()} ${MESI[sab.getMonth()]} ${sab.getFullYear()}`;
}

const MESI_FULL = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const GIORNI_FULL = ["", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

/** "Mercoledì 15 luglio 2026" */
export function fmtDayLong(d: Date): string {
  return `${GIORNI_FULL[dowOf(d)]} ${d.getDate()} ${MESI_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Luglio 2026" */
export function fmtMonthYear(d: Date): string {
  const m = MESI_FULL[d.getMonth()];
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${d.getFullYear()}`;
}

/** Età compiuta da data di nascita ISO (null se assente/invalida). */
export function ageFrom(isoDOB: string | null | undefined): number | null {
  if (!isoDOB) return null;
  const dob = parseISODate(isoDOB);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** "09:00:00" | "09:00" | null → "09:00" | null */
export function normTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = String(t).match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

/** Giorni mancanti a una data ISO (negativo se passata, null se assente). */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = parseISODate(iso);
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime();
  return Math.round((target.getTime() - t0) / 86_400_000);
}

// ─── Generazione accessi ──────────────────────────────────────────────

/** Cap di sicurezza se manca sia tot_accessi che data_scadenza. */
const MAX_GENERATED = 60;           // ~5 mesi a 3/settimana
const MAX_HORIZON_DAYS = 7 * 26;    // 6 mesi

/**
 * Genera le date degli accessi da pianificare per un paziente PAI.
 *
 * Regole:
 *  • parte da OGGI (o da data_attivazione se futura): i giorni già
 *    passati non vengono creati (in modalità automatica risulterebbero
 *    subito "fatti" per errore);
 *  • si ferma alla data_scadenza (inclusa) o all'orizzonte di sicurezza;
 *  • rispetta il tetto tot_accessi: gli accessi già esistenti con
 *    stato ≠ 'saltato' consumano il budget (i saltati no);
 *  • salta le date in cui esiste già un accesso (UNIQUE paziente+data).
 */
export function generateAccessDates(
  patient: Pick<CoopPatient, "giorni_orari" | "data_attivazione" | "data_scadenza" | "tot_accessi">,
  existing: { data: string; stato: string }[],
  from?: Date,
): { data: string; orario: string | null; stato: string }[] {
  const giorni = (patient.giorni_orari || []).filter(g => g && g.dow >= 1 && g.dow <= 6);
  if (giorni.length === 0) return [];

  const orarioByDow = new Map<number, string | null>();
  giorni.forEach(g => orarioByDow.set(g.dow, normTime(g.orario)));

  // Punto di partenza: se è passato "from" (data inizio scelta, anche retroattiva)
  // si parte ESATTAMENTE da lì. Altrimenti da oggi, oppure dalla data di attivazione
  // se questa è nel futuro. NB: la data retroattiva NON viene più scartata.
  const nowMid = new Date();
  const todayMid = new Date(nowMid.getFullYear(), nowMid.getMonth(), nowMid.getDate(), 12);
  let start: Date;
  if (from) {
    start = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  } else {
    start = todayMid;
    if (patient.data_attivazione) {
      const att = parseISODate(patient.data_attivazione);
      if (att.getTime() > start.getTime()) start = att; // solo se attivazione futura
    }
  }

  const end = patient.data_scadenza
    ? parseISODate(patient.data_scadenza)
    : addDays(start, MAX_HORIZON_DAYS);

  const consumed = existing.filter(a => a.stato !== "saltato").length;
  const budget = patient.tot_accessi != null && patient.tot_accessi > 0
    ? Math.max(0, patient.tot_accessi - consumed)
    : MAX_GENERATED;

  const taken = new Set(existing.map(a => a.data));
  const out: { data: string; orario: string | null; stato: string }[] = [];

  for (let d = new Date(start); d.getTime() <= end.getTime() && out.length < budget; d = addDays(d, 1)) {
    const dow = dowOf(d);
    if (!orarioByDow.has(dow)) continue;
    const iso = localISO(d);
    if (taken.has(iso)) continue;
    // I giorni già passati (<= oggi) nascono "fatto": il contatore scala da subito.
    const stato = d.getTime() <= todayMid.getTime() ? "fatto" : "pianificato";
    out.push({ data: iso, orario: orarioByDow.get(dow) ?? null, stato });
  }
  return out;
}

// ─── Contatori ────────────────────────────────────────────────────────

export type PatientCounters = {
  fatti: number;        // accessi effettuati (il "contatore")
  pianificati: number;  // in agenda, non ancora fatti
  saltati: number;
  consumati: number;    // fatti + pianificati (impegno sul budget)
  rimanenti: number | null; // tot_accessi - fatti (null se tot assente)
};

export function computeCounters(
  patient: Pick<CoopPatient, "tot_accessi">,
  accesses: { stato: string }[],
): PatientCounters {
  let fatti = 0, pianificati = 0, saltati = 0;
  for (const a of accesses) {
    if (a.stato === "fatto") fatti++;
    else if (a.stato === "pianificato") pianificati++;
    else saltati++;
  }
  const tot = patient.tot_accessi;
  return {
    fatti, pianificati, saltati,
    consumati: fatti + pianificati,
    rimanenti: tot != null && tot > 0 ? Math.max(0, tot - fatti) : null,
  };
}

/**
 * Numero progressivo di un accesso (per il badge "n/28"):
 * posizione dell'accesso tra i NON saltati del paziente, ordinati per data.
 */
export function progressiveOf(
  access: Pick<CoopAccess, "coop_patient_id" | "data" | "stato">,
  allOfPatient: Pick<CoopAccess, "data" | "stato">[],
): number {
  if (access.stato === "saltato") return 0;
  let n = 0;
  for (const a of allOfPatient) {
    if (a.stato === "saltato") continue;
    if (a.data <= access.data) n++;
  }
  return n;
}
