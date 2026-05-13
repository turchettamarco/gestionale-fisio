// ═══════════════════════════════════════════════════════════════════════
// src/lib/clinical/treatmentTechniques.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Catalogo delle tecniche/modalità di trattamento fisioterapico più comuni.
// Usato nel campo "Tecniche pianificate" del Piano di trattamento (Tappa 7).
//
// Modificabile direttamente qui — nessuna migration DB necessaria.
// L'utente può comunque aggiungere tecniche custom (testo libero).
//
// Categorie:
//   - Terapia manuale (mobilizzazioni, manipolazioni, tessuti molli)
//   - Metodiche strutturate (McKenzie, Maitland, Mulligan, ecc.)
//   - Esercizio terapeutico
//   - Fisiche / strumentali (tecar, laser, ecc.)
//   - Modalità complementari (taping, dry needling, ecc.)
// ═══════════════════════════════════════════════════════════════════════

export type TreatmentTechnique = {
  code: string;
  label: string;
  category: TechniqueCategory;
};

export type TechniqueCategory =
  | "manual"           // Terapia manuale
  | "method"           // Metodiche strutturate
  | "exercise"         // Esercizio terapeutico
  | "physical"         // Fisiche / strumentali
  | "complementary";   // Modalità complementari

export const CATEGORY_LABELS: Record<TechniqueCategory, string> = {
  manual:         "Terapia manuale",
  method:         "Metodiche",
  exercise:       "Esercizio terapeutico",
  physical:       "Fisiche / Strumentali",
  complementary:  "Complementari",
};

export const TREATMENT_TECHNIQUES: TreatmentTechnique[] = [
  // ─── TERAPIA MANUALE ──────────────────────────────────────────
  { code: "joint_mobilization",   label: "Mobilizzazione articolare",            category: "manual" },
  { code: "joint_manipulation",   label: "Manipolazione articolare (HVLA)",      category: "manual" },
  { code: "soft_tissue",          label: "Terapia tessuti molli",                category: "manual" },
  { code: "myofascial",           label: "Trattamento miofasciale",              category: "manual" },
  { code: "trigger_point",        label: "Trigger point therapy",                category: "manual" },
  { code: "massage_therapeutic",  label: "Massaggio terapeutico",                category: "manual" },
  { code: "massage_decontract",   label: "Massaggio decontratturante",           category: "manual" },
  { code: "stretching_passive",   label: "Stretching passivo",                   category: "manual" },
  { code: "lymphatic_drainage",   label: "Linfodrenaggio",                       category: "manual" },
  { code: "neurodynamics",        label: "Neurodinamica (mobilizzazione nervosa)", category: "manual" },

  // ─── METODICHE STRUTTURATE ────────────────────────────────────
  { code: "mckenzie",             label: "McKenzie (MDT)",                       category: "method" },
  { code: "maitland",             label: "Maitland",                             category: "method" },
  { code: "mulligan",             label: "Mulligan (MWM)",                       category: "method" },
  { code: "kaltenborn",           label: "Kaltenborn-Evjenth",                   category: "method" },
  { code: "cyriax",               label: "Cyriax",                               category: "method" },
  { code: "osteopathy",           label: "Osteopatia",                           category: "method" },
  { code: "stecco_fascial",       label: "Manipolazione Fasciale Stecco",        category: "method" },
  { code: "rpg",                  label: "Rieducazione Posturale Globale (RPG)", category: "method" },
  { code: "mezieres",             label: "Metodo Mézières",                      category: "method" },
  { code: "feldenkrais",          label: "Feldenkrais",                          category: "method" },
  { code: "bobath",               label: "Bobath (NDT)",                         category: "method" },
  { code: "kabat_pnf",            label: "Kabat / PNF",                          category: "method" },
  { code: "perfetti",             label: "Metodo Perfetti",                      category: "method" },
  { code: "souchard",             label: "Souchard",                             category: "method" },

  // ─── ESERCIZIO TERAPEUTICO ────────────────────────────────────
  { code: "ex_strengthening",     label: "Esercizi di rinforzo",                 category: "exercise" },
  { code: "ex_stabilization",     label: "Esercizi di stabilizzazione",          category: "exercise" },
  { code: "ex_core",              label: "Core stability",                       category: "exercise" },
  { code: "ex_proprioception",    label: "Esercizi propriocettivi",              category: "exercise" },
  { code: "ex_balance",           label: "Esercizi di equilibrio",               category: "exercise" },
  { code: "ex_neuromuscular",     label: "Controllo neuromuscolare",             category: "exercise" },
  { code: "ex_motor_control",     label: "Esercizi di controllo motorio",        category: "exercise" },
  { code: "ex_eccentric",         label: "Esercizi eccentrici",                  category: "exercise" },
  { code: "ex_isometric",         label: "Esercizi isometrici",                  category: "exercise" },
  { code: "ex_functional",        label: "Esercizi funzionali",                  category: "exercise" },
  { code: "ex_aerobic",           label: "Allenamento aerobico",                 category: "exercise" },
  { code: "ex_postural",          label: "Esercizi posturali",                   category: "exercise" },
  { code: "ex_breathing",         label: "Esercizi respiratori",                 category: "exercise" },
  { code: "ex_gait",              label: "Rieducazione del cammino",             category: "exercise" },
  { code: "ex_home",              label: "Programma esercizi domiciliari",       category: "exercise" },
  { code: "ex_pelvic_floor",      label: "Riabilitazione pavimento pelvico",     category: "exercise" },

  // ─── FISICHE / STRUMENTALI ────────────────────────────────────
  { code: "tecar",                label: "Tecarterapia",                         category: "physical" },
  { code: "laser_yag",            label: "Laser Yag ad alta potenza",            category: "physical" },
  { code: "laser_low",            label: "Laser a bassa intensità",              category: "physical" },
  { code: "ultrasound",           label: "Ultrasuoni",                           category: "physical" },
  { code: "tens",                 label: "TENS",                                 category: "physical" },
  { code: "electrostim",          label: "Elettrostimolazione",                  category: "physical" },
  { code: "magnetotherapy",       label: "Magnetoterapia",                       category: "physical" },
  { code: "shockwave",            label: "Onde d'urto",                          category: "physical" },
  { code: "cryotherapy",          label: "Crioterapia",                          category: "physical" },
  { code: "thermotherapy",        label: "Termoterapia",                         category: "physical" },
  { code: "hydrotherapy",         label: "Idroterapia",                          category: "physical" },
  { code: "traction",             label: "Trazione meccanica",                   category: "physical" },

  // ─── COMPLEMENTARI ────────────────────────────────────────────
  { code: "kinesio_taping",       label: "Kinesio taping",                       category: "complementary" },
  { code: "rigid_taping",         label: "Taping rigido (functional)",           category: "complementary" },
  { code: "bracing",              label: "Tutori / ortesi",                      category: "complementary" },
  { code: "dry_needling",         label: "Dry needling",                         category: "complementary" },
  { code: "cupping",              label: "Coppettazione",                        category: "complementary" },
  { code: "iastm",                label: "IASTM (Strumenti tessuti molli)",      category: "complementary" },
  { code: "education",            label: "Educazione del paziente",              category: "complementary" },
  { code: "pain_education",       label: "Educazione al dolore (PNE)",           category: "complementary" },
  { code: "ergonomics",           label: "Consulenza ergonomica",                category: "complementary" },
];

/** Trova etichetta da codice. Se non trovato (custom), restituisce il codice. */
export function getTechniqueLabel(code: string): string {
  const found = TREATMENT_TECHNIQUES.find(t => t.code === code);
  return found ? found.label : code;
}

/** Raggruppa per categoria. */
export function getTechniquesByCategory(): Record<TechniqueCategory, TreatmentTechnique[]> {
  const grouped = {} as Record<TechniqueCategory, TreatmentTechnique[]>;
  for (const t of TREATMENT_TECHNIQUES) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  }
  return grouped;
}

export const CATEGORY_ORDER: TechniqueCategory[] = ["manual", "method", "exercise", "physical", "complementary"];
