// src/lib/clinical/customFields.ts
// ═══════════════════════════════════════════════════════════════════════
// Definizione condivisa dei campi personalizzati della scheda clinica
// (mig. 095), usata sia dalle Impostazioni sia dalla cartella paziente.
// ═══════════════════════════════════════════════════════════════════════

export type ClinicalFieldType =
  | "text" | "textarea" | "select" | "multiselect" | "scale" | "checkbox" | "date";

/** Una scheda clinica dello studio (mig. 096). */
export type ClinicalTemplate = {
  id: string;
  studio_id?: string;
  name: string;
  is_default: boolean;
  sort_order: number;
  /** FALSE = archiviata: non selezionabile, ma i dati restano leggibili (mig. 097). */
  is_active?: boolean;
};

export type ClinicalField = {
  id: string;
  studio_id?: string;
  template_id?: string | null;
  label: string;
  hint: string | null;
  type: ClinicalFieldType;
  options: string[];
  section: string | null;
  sort_order: number;
  is_active: boolean;
};

export const FIELD_TYPE_LABELS: Record<ClinicalFieldType, string> = {
  text:        "Riga di testo",
  textarea:    "Testo lungo",
  select:      "Scelta singola",
  multiselect: "Scelta multipla",
  scale:       "Valore da 0 a 10",
  checkbox:    "Sì / No",
  date:        "Data",
};

/** I tipi che hanno bisogno di un elenco di scelte. */
export const TYPES_WITH_OPTIONS: ClinicalFieldType[] = ["select", "multiselect"];

export type StarterTemplate = {
  id: string;
  name: string;
  description: string;
  fields: Array<Omit<ClinicalField, "id" | "studio_id" | "sort_order" | "is_active">>;
};

/**
 * Modelli di partenza: chi non ha voglia di costruirsi la scheda da zero
 * ne carica uno e poi lo modifica. Sono volutamente CORTI — cinque o sei
 * campi — perché una scheda lunga è esattamente il problema da cui si
 * scappa. Meglio partire scarni e aggiungere solo ciò che manca davvero.
 */
export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "fisio",
    name: "Fisioterapia — essenziale",
    description: "Sei campi: il minimo per inquadrare un caso muscoloscheletrico",
    fields: [
      { label: "Motivo della visita", hint: "Con le parole del paziente", type: "textarea", options: [], section: null },
      { label: "Zona interessata", hint: "Es. spalla destra, lombare", type: "text", options: [], section: null },
      { label: "Da quanto tempo", hint: null, type: "select", options: ["Meno di 1 settimana", "1-4 settimane", "1-6 mesi", "Oltre 6 mesi"], section: null },
      { label: "Dolore attuale", hint: "0 nessun dolore, 10 il massimo", type: "scale", options: [], section: null },
      { label: "Cosa ho trovato", hint: "Osservazione, palpazione, test", type: "textarea", options: [], section: null },
      { label: "Cosa faccio", hint: "Trattamento e indicazioni", type: "textarea", options: [], section: null },
    ],
  },
  {
    id: "osteo",
    name: "Osteopatia",
    description: "Cinque campi impostati sul ragionamento osteopatico",
    fields: [
      { label: "Motivo della consultazione", hint: null, type: "textarea", options: [], section: null },
      { label: "Anamnesi rilevante", hint: "Traumi, interventi, viscerale, denti", type: "textarea", options: [], section: null },
      { label: "Valutazione globale", hint: "Postura, mobilità, ascolto", type: "textarea", options: [], section: null },
      { label: "Disfunzioni riscontrate", hint: "Sede e caratteristiche", type: "textarea", options: [], section: null },
      { label: "Trattamento e riverifica", hint: "Tecniche usate ed esito", type: "textarea", options: [], section: null },
    ],
  },
  {
    id: "minimo",
    name: "Minimo",
    description: "Tre campi liberi: per chi scrive di getto e basta",
    fields: [
      { label: "Situazione", hint: "Come si presenta oggi", type: "textarea", options: [], section: null },
      { label: "Cosa ho fatto", hint: null, type: "textarea", options: [], section: null },
      { label: "Prossima volta", hint: "Da riprendere al controllo", type: "textarea", options: [], section: null },
    ],
  },
];

/** Valore vuoto coerente col tipo, per inizializzare la scheda. */
export function emptyValueFor(type: ClinicalFieldType): unknown {
  if (type === "multiselect") return [];
  if (type === "checkbox") return false;
  if (type === "scale") return null;
  return "";
}

/** Il campo risulta compilato? Serve per il contatore "X/Y". */
export function isFilled(type: ClinicalFieldType, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (type === "multiselect") return Array.isArray(value) && value.length > 0;
  if (type === "checkbox") return value === true;
  if (type === "scale") return typeof value === "number";
  return String(value).trim() !== "";
}
