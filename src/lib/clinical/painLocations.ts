// ═══════════════════════════════════════════════════════════════════════
// src/lib/clinical/painLocations.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Catalogo delle zone corporee usate nella sezione "Anamnesi" del
// Quadro Clinico (Tappa 5 refactor UX).
//
// Struttura basata su convenzione standard di valutazione fisioterapica:
//   - Physiotutors (panoramica fisioterapica internazionale)
//   - GRIP — Graphical Index of Pain (Pain Journal 2020, peer-reviewed)
//   - Convenzione anatomica italiana standard
//
// USO:
//   - Salvato in clinical_assessments.pain_locations come array di codici
//     (es. ["lumbar_low", "sacroiliac_right", "gluteus_right"])
//   - Modificabile QUI direttamente — niente migration DB necessaria
//
// CONVENZIONE BILATERALITÀ:
//   - Zone monolaterali: codice singolo (es. "coccyx")
//   - Zone bilaterali: suffisso _left / _right / _bilateral
//
// ═══════════════════════════════════════════════════════════════════════

export type PainLocation = {
  /** Codice univoco salvato in DB (snake_case). */
  code: string;
  /** Etichetta italiana mostrata nella UI. */
  label: string;
  /** True se la zona è bilaterale (compare dx/sx/bilaterale). */
  bilateral?: boolean;
};

export type PainDistrict = {
  /** ID del distretto. */
  id: string;
  /** Etichetta italiana del distretto. */
  label: string;
  /** Icona/emoji per UI. */
  icon: string;
  /** Lista zone del distretto. */
  zones: PainLocation[];
};

// ═══════════════════════════════════════════════════════════════════════

export const PAIN_DISTRICTS: PainDistrict[] = [

  // ── 1. CAPO E COLLO ──────────────────────────────────────────────────
  {
    id: "head_neck",
    label: "Capo e collo",
    icon: "🧠",
    zones: [
      { code: "headache_frontal",   label: "Cefalea frontale" },
      { code: "headache_temporal",  label: "Cefalea temporale", bilateral: true },
      { code: "headache_occipital", label: "Cefalea occipitale" },
      { code: "tmj",                label: "ATM (mandibola)",   bilateral: true },
      { code: "cervical_upper",     label: "Cervicale alto (C0–C2)" },
      { code: "cervical_lower",     label: "Cervicale basso (C3–C7)" },
      { code: "cervico_thoracic",   label: "Cerniera cervico-dorsale (C7–T1)" },
    ],
  },

  // ── 2. RACHIDE DORSALE ──────────────────────────────────────────────
  {
    id: "thoracic_spine",
    label: "Rachide dorsale",
    icon: "🦴",
    zones: [
      { code: "thoracic_upper",  label: "Dorsale alto (T1–T4)" },
      { code: "thoracic_mid",    label: "Dorsale medio (T5–T8)" },
      { code: "thoracic_lower",  label: "Dorsale basso (T9–T12)" },
      { code: "interscapular",   label: "Interscapolare", bilateral: true },
      { code: "costal",          label: "Costale", bilateral: true },
      { code: "thoraco_lumbar",  label: "Cerniera dorso-lombare (T12–L1)" },
    ],
  },

  // ── 3. RACHIDE LOMBO-SACRALE ────────────────────────────────────────
  {
    id: "lumbosacral",
    label: "Rachide lombo-sacrale",
    icon: "🧍",
    zones: [
      { code: "lumbar_upper",   label: "Lombare alto (L1–L3)" },
      { code: "lumbar_lower",   label: "Lombare basso (L4–L5)" },
      { code: "lumbosacral",    label: "Cerniera lombo-sacrale (L5–S1)" },
      { code: "sacroiliac",     label: "Sacro-iliaca", bilateral: true },
      { code: "sacrum",         label: "Sacro" },
      { code: "coccyx",         label: "Coccige" },
      { code: "gluteus",        label: "Gluteo", bilateral: true },
    ],
  },

  // ── 4. ARTO SUPERIORE ───────────────────────────────────────────────
  {
    id: "upper_limb",
    label: "Arto superiore",
    icon: "💪",
    zones: [
      { code: "shoulder",            label: "Spalla (gleno-omerale)", bilateral: true },
      { code: "scapulothoracic",     label: "Scapolo-toracica",       bilateral: true },
      { code: "acromioclavicular",   label: "Acromion-claveare",      bilateral: true },
      { code: "trapezius_upper",     label: "Trapezio superiore",     bilateral: true },
      { code: "arm",                 label: "Braccio",                bilateral: true },
      { code: "elbow",               label: "Gomito",                 bilateral: true },
      { code: "lateral_epicondyle",  label: "Epicondilo laterale",    bilateral: true },
      { code: "medial_epicondyle",   label: "Epitroclea (epicondilo mediale)", bilateral: true },
      { code: "forearm",             label: "Avambraccio",            bilateral: true },
      { code: "wrist",               label: "Polso",                  bilateral: true },
      { code: "hand",                label: "Mano",                   bilateral: true },
      { code: "thumb",               label: "Pollice",                bilateral: true },
      { code: "fingers",             label: "Dita lunghe",            bilateral: true },
    ],
  },

  // ── 5. ARTO INFERIORE ───────────────────────────────────────────────
  {
    id: "lower_limb",
    label: "Arto inferiore",
    icon: "🦵",
    zones: [
      { code: "hip",                  label: "Anca (coxo-femorale)",      bilateral: true },
      { code: "groin",                label: "Inguine / pubalgia",         bilateral: true },
      { code: "thigh_anterior",       label: "Coscia anteriore",           bilateral: true },
      { code: "thigh_posterior",      label: "Coscia posteriore (ischiocrurali)", bilateral: true },
      { code: "thigh_lateral",        label: "Coscia laterale (TFL/ITB)",  bilateral: true },
      { code: "thigh_medial",         label: "Coscia mediale (adduttori)", bilateral: true },
      { code: "knee",                 label: "Ginocchio (femoro-tibiale)", bilateral: true },
      { code: "patellofemoral",       label: "Femoro-rotulea",             bilateral: true },
      { code: "pes_anserinus",        label: "Zampa d'oca (pes anserinus)", bilateral: true },
      { code: "calf",                 label: "Polpaccio",                  bilateral: true },
      { code: "achilles",             label: "Tendine d'Achille",          bilateral: true },
      { code: "ankle",                label: "Caviglia",                   bilateral: true },
      { code: "heel",                 label: "Tallone",                    bilateral: true },
      { code: "foot_dorsum",          label: "Dorso del piede",            bilateral: true },
      { code: "foot_sole",            label: "Pianta del piede",           bilateral: true },
      { code: "metatarsal",           label: "Avampiede (metatarsi)",      bilateral: true },
      { code: "toes",                 label: "Dita del piede",             bilateral: true },
    ],
  },

  // ── 6. TORACE E ADDOME ──────────────────────────────────────────────
  {
    id: "trunk",
    label: "Torace e addome",
    icon: "🫀",
    zones: [
      { code: "sternal",          label: "Sternale" },
      { code: "pectoral",         label: "Pettorale", bilateral: true },
      { code: "abdominal",        label: "Addome" },
      { code: "diaphragm",        label: "Diaframma" },
      { code: "intercostal",      label: "Intercostale", bilateral: true },
    ],
  },

  // ── 7. PAVIMENTO PELVICO ────────────────────────────────────────────
  {
    id: "pelvic_floor",
    label: "Pavimento pelvico",
    icon: "🩷",
    zones: [
      { code: "pelvic_anterior",  label: "Pelvico anteriore" },
      { code: "pelvic_posterior", label: "Pelvico posteriore" },
      { code: "perineal",         label: "Perineale" },
    ],
  },

  // ── 8. ALTRO / DIFFUSO ──────────────────────────────────────────────
  {
    id: "other",
    label: "Altro / diffuso",
    icon: "🩺",
    zones: [
      { code: "widespread",       label: "Dolore diffuso (fibromialgia, dolore cronico generalizzato)" },
      { code: "unspecified",      label: "Da specificare nelle note" },
    ],
  },

];

// ═══════════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════════

/**
 * Espande un codice zona base in codici bilaterali se applicabile.
 * Es. "shoulder" → ["shoulder_left", "shoulder_right", "shoulder_bilateral"]
 *     "coccyx"   → ["coccyx"]
 */
export function expandBilateralCodes(zone: PainLocation): Array<{ code: string; label: string }> {
  if (!zone.bilateral) return [{ code: zone.code, label: zone.label }];
  return [
    { code: `${zone.code}_left`,      label: `${zone.label} (sx)` },
    { code: `${zone.code}_right`,     label: `${zone.label} (dx)` },
    { code: `${zone.code}_bilateral`, label: `${zone.label} (bilaterale)` },
  ];
}

/**
 * Cerca l'etichetta italiana di un codice zona (anche se è bilaterale).
 */
export function getPainLocationLabel(code: string): string {
  // Cerca match diretto (zone monolaterali)
  for (const district of PAIN_DISTRICTS) {
    for (const zone of district.zones) {
      if (zone.code === code) return zone.label;
    }
  }
  // Cerca match con suffisso bilaterale
  const m = code.match(/^(.+)_(left|right|bilateral)$/);
  if (m) {
    const [, baseCode, side] = m;
    for (const district of PAIN_DISTRICTS) {
      for (const zone of district.zones) {
        if (zone.code === baseCode && zone.bilateral) {
          const sideLabel = side === "left" ? "sx" : side === "right" ? "dx" : "bilaterale";
          return `${zone.label} (${sideLabel})`;
        }
      }
    }
  }
  return code; // fallback: mostra il codice se non trovato
}

/**
 * Restituisce TUTTI i codici possibili (per validazioni o query).
 */
export function getAllPainLocationCodes(): string[] {
  const codes: string[] = [];
  for (const district of PAIN_DISTRICTS) {
    for (const zone of district.zones) {
      if (zone.bilateral) {
        codes.push(`${zone.code}_left`, `${zone.code}_right`, `${zone.code}_bilateral`);
      } else {
        codes.push(zone.code);
      }
    }
  }
  return codes;
}
