// ═══════════════════════════════════════════════════════════════════════
// src/lib/permissions.ts — Permessi granulari per membro (mig. 071)
// ═══════════════════════════════════════════════════════════════════════
// Fonte unica di verità su "chi può vedere/fare cosa".
//
// MODELLO:
//   • Ogni membro ha un PRESET (base / medio / completo paziente / tutto)
//     oppure "custom" con i singoli permessi scelti a mano.
//   • Owner e co-titolare hanno sempre tutto, il preset viene ignorato.
//   • Se preset e permissions sono NULL si applica il default del ruolo,
//     così gli studi già esistenti non cambiano comportamento.
//
// NOTA: questo è il livello FUNZIONALE (cosa mostra l'interfaccia). Il
// confine forte restano le RLS lato database.
// ═══════════════════════════════════════════════════════════════════════

export type PermissionKey =
  // ── Dati del paziente ────────────────────────────────────────────────
  | "patient.name_full"      // nome e cognome completi (altrimenti iniziali)
  | "patient.age"            // età
  | "patient.birthdate"      // data di nascita completa
  | "patient.phone"          // telefono
  | "patient.email"
  | "patient.address"        // indirizzo
  | "patient.fiscal_code"    // codice fiscale
  | "patient.clinical"       // cartella clinica, SOAP, valutazioni
  | "patient.attachments"    // referti e allegati
  | "patient.history_full"   // anamnesi completa
  | "patient.notes_private"  // note riservate del titolare
  // ── Agenda ───────────────────────────────────────────────────────────
  | "agenda.view_all"        // vede l'agenda di tutti (altrimenti solo la propria)
  | "agenda.edit_others"     // può modificare appuntamenti altrui
  | "agenda.book_for_others" // può prenotare NELL'agenda dei colleghi
  | "agenda.create"          // può creare appuntamenti
  // ── Aspetti economici ────────────────────────────────────────────────
  | "money.amounts"          // importi delle sedute
  | "money.reports"          // report e statistiche
  | "money.accounting"       // contabilità e incassi
  | "money.tessera_sanitaria"
  // ── Gestione ─────────────────────────────────────────────────────────
  | "manage.patients_edit"   // crea/modifica anagrafiche
  | "manage.patients_delete"
  | "manage.settings"        // impostazioni studio
  | "manage.team"            // gestione team e permessi
  | "manage.convenzioni"
  | "manage.waitlist"
  | "manage.domicili"
  | "manage.exports";        // esportazioni dati e PDF massivi

/** Etichette in italiano per l'interfaccia, raggruppate per area. */
export const PERMISSION_GROUPS: Array<{
  group: string;
  description: string;
  items: Array<{ key: PermissionKey; label: string; hint?: string }>;
}> = [
  {
    group: "Dati del paziente",
    description: "Cosa vede il collaboratore nella scheda paziente.",
    items: [
      { key: "patient.name_full", label: "Nome e cognome completi", hint: "Se disattivo vede solo le iniziali" },
      { key: "patient.age", label: "Età" },
      { key: "patient.birthdate", label: "Data di nascita completa" },
      { key: "patient.phone", label: "Numero di telefono" },
      { key: "patient.email", label: "Email" },
      { key: "patient.address", label: "Indirizzo" },
      { key: "patient.fiscal_code", label: "Codice fiscale" },
      { key: "patient.clinical", label: "Cartella clinica e SOAP" },
      { key: "patient.attachments", label: "Referti e allegati" },
      { key: "patient.history_full", label: "Anamnesi completa" },
      { key: "patient.notes_private", label: "Note riservate" },
    ],
  },
  {
    group: "Agenda",
    description: "Cosa può fare sul calendario.",
    items: [
      { key: "agenda.view_all", label: "Vede l'agenda di tutti", hint: "Se disattivo vede solo le proprie sedute" },
      { key: "agenda.create", label: "Può creare appuntamenti" },
      { key: "agenda.edit_others", label: "Può modificare appuntamenti altrui" },
      { key: "agenda.book_for_others", label: "Può prenotare per i colleghi", hint: "Se disattivo può creare appuntamenti solo per sé" },
    ],
  },
  {
    group: "Economia",
    description: "Importi, incassi e adempimenti fiscali.",
    items: [
      { key: "money.amounts", label: "Vede gli importi delle sedute" },
      { key: "money.reports", label: "Report e statistiche" },
      { key: "money.accounting", label: "Contabilità e incassi" },
      { key: "money.tessera_sanitaria", label: "Tessera Sanitaria" },
    ],
  },
  {
    group: "Gestione",
    description: "Funzioni amministrative dello studio.",
    items: [
      { key: "manage.patients_edit", label: "Crea e modifica pazienti" },
      { key: "manage.patients_delete", label: "Elimina pazienti" },
      { key: "manage.settings", label: "Impostazioni studio" },
      { key: "manage.team", label: "Gestione team e permessi" },
      { key: "manage.convenzioni", label: "Convenzioni ed enti" },
      { key: "manage.waitlist", label: "Lista d'attesa" },
      { key: "manage.domicili", label: "Domicili e cooperative" },
      { key: "manage.exports", label: "Esportazioni e stampe massive" },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionKey[] =
  PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key));

export type PermissionPreset = "base" | "medium" | "patient_full" | "all" | "custom";

/** Livello BASE: solo cartella clinica ed età, come richiesto. */
const PRESET_BASE: PermissionKey[] = [
  "patient.name_full",
  "patient.age",
  "patient.clinical",
  "agenda.create",
];

/** Livello MEDIO: base + anamnesi, allegati, email e agenda condivisa. */
const PRESET_MEDIUM: PermissionKey[] = [
  ...PRESET_BASE,
  "patient.birthdate",
  "patient.history_full",
  "patient.attachments",
  "patient.email",
  "agenda.view_all",
  "manage.waitlist",
];

/** Livello COMPLETO PAZIENTE: tutti i dati del paziente, niente economia. */
const PRESET_PATIENT_FULL: PermissionKey[] = [
  ...PRESET_MEDIUM,
  "patient.phone",
  "patient.address",
  "patient.fiscal_code",
  "patient.notes_private",
  "agenda.edit_others",
  "agenda.book_for_others",
  "manage.patients_edit",
  "manage.exports",
];

export const PRESET_LABELS: Record<PermissionPreset, { label: string; description: string }> = {
  base: {
    label: "Base",
    description: "Solo cartella clinica ed età. Nessun contatto, nessun importo.",
  },
  medium: {
    label: "Intermedio",
    description: "Cartella clinica, anamnesi, allegati, email e agenda condivisa.",
  },
  patient_full: {
    label: "Completo paziente",
    description: "Tutti i dati del paziente, contatti inclusi. Niente economia né impostazioni.",
  },
  all: {
    label: "Accesso totale",
    description: "Vede e gestisce tutto, come il titolare.",
  },
  custom: {
    label: "Su misura",
    description: "Scegli una per una le funzioni consentite.",
  },
};

export function presetPermissions(preset: PermissionPreset): PermissionKey[] {
  switch (preset) {
    case "base": return [...PRESET_BASE];
    case "medium": return [...PRESET_MEDIUM];
    case "patient_full": return [...PRESET_PATIENT_FULL];
    case "all": return [...ALL_PERMISSIONS];
    case "custom": return [];
  }
}

export type MemberPermissionSource = {
  role: "owner" | "co_owner" | "therapist" | "assistant" | string;
  permission_preset?: string | null;
  permissions?: unknown;
};

/**
 * Insieme effettivo dei permessi di un membro.
 *   • owner / co_owner → sempre tutto
 *   • preset valorizzato → il preset (o l'elenco custom)
 *   • NULL → default storico del ruolo: l'assistente (segreteria) vede
 *     tutto, il terapista ha il livello base.
 */
export function resolvePermissions(member: MemberPermissionSource | null | undefined): Set<PermissionKey> {
  if (!member) return new Set();
  if (member.role === "owner" || member.role === "co_owner") {
    return new Set(ALL_PERMISSIONS);
  }

  const preset = member.permission_preset as PermissionPreset | null | undefined;

  if (preset === "custom") {
    const raw = Array.isArray(member.permissions) ? member.permissions : [];
    return new Set(raw.filter((k): k is PermissionKey =>
      typeof k === "string" && (ALL_PERMISSIONS as string[]).includes(k)
    ));
  }

  if (preset) return new Set(presetPermissions(preset));

  // Nessuna configurazione: default per ruolo.
  if (member.role === "assistant") return new Set(ALL_PERMISSIONS);
  return new Set(PRESET_BASE);
}

/** Scorciatoia di lettura. */
export function can(perms: Set<PermissionKey>, key: PermissionKey): boolean {
  return perms.has(key);
}

/** Maschera un nome quando manca il permesso al nome completo. */
export function maskPatientName(fullName: string, perms: Set<PermissionKey>): string {
  if (perms.has("patient.name_full")) return fullName;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts.map(p => `${p[0].toUpperCase()}.`).join(" ");
}

/** Età da data di nascita, per i livelli che vedono l'età ma non la data. */
export function ageFromBirthdate(birthdate: string | Date | null | undefined): number | null {
  if (!birthdate) return null;
  const d = typeof birthdate === "string" ? new Date(birthdate) : birthdate;
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}
