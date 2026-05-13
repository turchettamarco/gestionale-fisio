// ═══════════════════════════════════════════════════════════════════════
// src/lib/clinical/orthopedicTests/types.ts
// ═══════════════════════════════════════════════════════════════════════
// Tipo dei test ortopedici. Usato in tutti i file del catalogo.
// ═══════════════════════════════════════════════════════════════════════

export type OrthopedicTest = {
  /** Nome del test (come usato comunemente in clinica italiana). */
  name: string;

  /** Distretto anatomico principale. */
  district: TestDistrict;

  /** A cosa serve / cosa testa (1 frase concisa, finalità clinica). */
  purpose: string;

  /** Procedura di esecuzione (2-4 frasi step by step). */
  procedure: string;

  /** Cosa indica un esito positivo. */
  positive: string;

  /** Sensibilità (se disponibile in letteratura, in %). */
  sensitivity?: string;

  /** Specificità (se disponibile in letteratura, in %). */
  specificity?: string;

  /** Fonte/riferimento bibliografico. */
  source?: string;

  /** Sinonimi per ricerca/autocomplete. */
  aliases?: string[];
};

export type TestDistrict =
  | "cervical"
  | "thoracic"
  | "lumbar"
  | "sacroiliac"
  | "shoulder"
  | "elbow"
  | "wrist"
  | "hip"
  | "knee"
  | "ankle"
  | "neuro"
  | "vascular"      // test vascolari (Allen, Wright, ecc.)
  | "tmj";          // ATM


export const DISTRICT_LABELS: Record<TestDistrict, string> = {
  cervical:   "Rachide cervicale",
  thoracic:   "Rachide dorsale",
  lumbar:     "Rachide lombare",
  sacroiliac: "Sacroiliaca",
  shoulder:   "Spalla",
  elbow:      "Gomito",
  wrist:      "Polso e mano",
  hip:        "Anca",
  knee:       "Ginocchio",
  ankle:      "Caviglia e piede",
  neuro:      "Test neurologici",
  vascular:   "Test vascolari / TOS",
  tmj:        "ATM (mandibola)",
};

export const DISTRICT_ICONS: Record<TestDistrict, string> = {
  cervical:   "🧠",
  thoracic:   "🦴",
  lumbar:     "🧍",
  sacroiliac: "🧍",
  shoulder:   "💪",
  elbow:      "💪",
  wrist:      "✋",
  hip:        "🦵",
  knee:       "🦵",
  ankle:      "🦶",
  neuro:      "⚡",
  vascular:   "🩸",
  tmj:        "👄",
};

export const DISTRICT_ORDER: TestDistrict[] = [
  "cervical", "tmj", "thoracic", "lumbar", "sacroiliac",
  "shoulder", "elbow", "wrist",
  "hip", "knee", "ankle",
  "neuro", "vascular",
];
