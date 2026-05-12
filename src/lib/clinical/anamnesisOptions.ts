// ═══════════════════════════════════════════════════════════════════════
// src/lib/clinical/anamnesisOptions.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Catalogo delle opzioni standard per l'Anamnesi strutturata
// (Tappa 5 refactor UX).
//
// Modificabile direttamente qui — nessuna migration DB necessaria.
//
// USO: salvato in clinical_assessments come codici string.
// ═══════════════════════════════════════════════════════════════════════

// ── Modalità di insorgenza ──────────────────────────────────────────
export const ONSET_TYPES = [
  { code: "gradual",       label: "Graduale",         description: "Comparsa progressiva nel tempo" },
  { code: "sudden",        label: "Improvvisa",       description: "Insorgenza acuta senza causa apparente" },
  { code: "traumatic",     label: "Traumatica",       description: "Dopo trauma o evento specifico" },
  { code: "post_surgical", label: "Post-chirurgica",  description: "Successiva a intervento" },
  { code: "unknown",       label: "Sconosciuta",      description: "Il paziente non sa indicare" },
] as const;

export type OnsetType = typeof ONSET_TYPES[number]["code"];


// ── Frequenza del dolore ────────────────────────────────────────────
export const PAIN_FREQUENCIES = [
  { code: "constant",      label: "Costante",      description: "Sempre presente, mai assente" },
  { code: "intermittent",  label: "Intermittente", description: "Va e viene durante la giornata" },
  { code: "episodic",      label: "Episodico",     description: "Periodi senza dolore, poi crisi" },
  { code: "with_activity", label: "Con attività",  description: "Solo durante o dopo specifiche attività" },
] as const;

export type PainFrequency = typeof PAIN_FREQUENCIES[number]["code"];


// ── Caratteristiche del dolore (multi-select) ───────────────────────
// Basate su McGill Pain Questionnaire (versione breve, traduzione clinica italiana)
export const PAIN_CHARACTERISTICS = [
  { code: "sharp",        label: "Acuto / pungente",   icon: "🔪" },
  { code: "dull",         label: "Sordo",              icon: "🔵" },
  { code: "burning",      label: "Bruciante / urente", icon: "🔥" },
  { code: "throbbing",    label: "Pulsante",           icon: "💓" },
  { code: "stabbing",     label: "Lancinante",         icon: "⚡" },
  { code: "cramping",     label: "Crampiforme",        icon: "🪢" },
  { code: "tingling",     label: "Formicolio",         icon: "✨" },
  { code: "numbness",     label: "Intorpidimento",     icon: "🧊" },
  { code: "deep",         label: "Profondo",           icon: "⬇️" },
  { code: "superficial",  label: "Superficiale",       icon: "🌊" },
  { code: "radiating",    label: "Irradiato",          icon: "📡" },
  { code: "shooting",     label: "A scossa elettrica", icon: "⚡" },
  { code: "stiff",        label: "Rigido",             icon: "🧱" },
  { code: "heavy",        label: "Pesante",            icon: "🏋️" },
] as const;

export type PainCharacteristic = typeof PAIN_CHARACTERISTICS[number]["code"];


// ── Unità di durata ─────────────────────────────────────────────────
export const DURATION_UNITS = [
  { code: "days",   label: "giorni"    },
  { code: "weeks",  label: "settimane" },
  { code: "months", label: "mesi"      },
  { code: "years",  label: "anni"      },
] as const;

export type DurationUnit = typeof DURATION_UNITS[number]["code"];


// ── Fattori aggravanti/allevianti standard (suggeriti, ma testo libero) ─
// Marco può digitare qualsiasi cosa; questi sono solo suggerimenti rapidi.
export const COMMON_AGGRAVATING_FACTORS = [
  "Movimento", "Riposo prolungato", "Postura seduta", "Postura in piedi",
  "Sollevamento pesi", "Flessione anteriore", "Estensione", "Rotazione",
  "Camminare", "Salire/scendere scale", "Tosse/starnuto", "Freddo", "Umidità",
  "Stress emotivo", "Sforzo fisico", "Notte", "Mattino", "Sera",
];

export const COMMON_RELIEVING_FACTORS = [
  "Riposo", "Movimento dolce", "Caldo", "Freddo", "FANS",
  "Posizione supina", "Posizione laterale", "Camminare lentamente",
  "Stretching", "Massaggio", "Distrazione",
];


// ── Helper ──────────────────────────────────────────────────────────

/** Cerca l'etichetta italiana di un codice in un set di opzioni. */
export function labelOf<T extends ReadonlyArray<{ code: string; label: string }>>(
  options: T,
  code: string | null | undefined
): string | null {
  if (!code) return null;
  const found = options.find(o => o.code === code);
  return found ? found.label : code;
}
