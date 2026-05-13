// ═══════════════════════════════════════════════════════════════════════
// src/lib/clinical/orthopedicTests/index.ts
// ═══════════════════════════════════════════════════════════════════════
// Index del catalogo dei test ortopedici. Unisce tutti i distretti.
//
// USO:
//   import { ORTHOPEDIC_TESTS, searchOrthopedicTests, findTestByName } from "@/src/lib/clinical/orthopedicTests";
//
// Per aggiungere test: modificare il file del distretto corrispondente
// (spine.ts, upperLimb.ts, lowerLimb.ts, neuro.ts).
// ═══════════════════════════════════════════════════════════════════════

import { SPINE_TESTS } from "./spine";
import { UPPER_LIMB_TESTS } from "./upperLimb";
import { LOWER_LIMB_TESTS } from "./lowerLimb";
import { NEURO_TESTS } from "./neuro";
import type { OrthopedicTest, TestDistrict } from "./types";

export { DISTRICT_LABELS, DISTRICT_ICONS, DISTRICT_ORDER } from "./types";
export type { OrthopedicTest, TestDistrict } from "./types";

// Unione di tutti i test
export const ORTHOPEDIC_TESTS: OrthopedicTest[] = [
  ...SPINE_TESTS,
  ...UPPER_LIMB_TESTS,
  ...LOWER_LIMB_TESTS,
  ...NEURO_TESTS,
];

// ─── Helper ─────────────────────────────────────────────────────

/** Restituisce i test che matchano una query (case-insensitive, nome + alias). */
export function searchOrthopedicTests(query: string, limit = 8): OrthopedicTest[] {
  const q = query.trim().toLowerCase();
  if (!q) return ORTHOPEDIC_TESTS.slice(0, limit);
  return ORTHOPEDIC_TESTS.filter(t => {
    if (t.name.toLowerCase().includes(q)) return true;
    if (t.aliases?.some(a => a.toLowerCase().includes(q))) return true;
    return false;
  }).slice(0, limit);
}

/** Trova un test per nome esatto (case-insensitive). */
export function findTestByName(name: string): OrthopedicTest | null {
  const q = name.trim().toLowerCase();
  return ORTHOPEDIC_TESTS.find(t =>
    t.name.toLowerCase() === q ||
    t.aliases?.some(a => a.toLowerCase() === q)
  ) || null;
}

/** Raggruppa tutti i test per distretto. */
export function getTestsByDistrict(): Record<TestDistrict, OrthopedicTest[]> {
  const grouped = {} as Record<TestDistrict, OrthopedicTest[]>;
  for (const t of ORTHOPEDIC_TESTS) {
    if (!grouped[t.district]) grouped[t.district] = [];
    grouped[t.district].push(t);
  }
  return grouped;
}

// ─── Etichette UI ─────────────────────────────────────────────

export const TEST_RESULTS = [
  { code: "positive",       label: "Positivo",       color: "#dc2626" },
  { code: "negative",       label: "Negativo",       color: "#16a34a" },
  { code: "inconclusive",   label: "Dubbio",         color: "#f59e0b" },
  { code: "not_assessable", label: "Non valutabile", color: "#94a3b8" },
] as const;

export const TEST_SIDES = [
  { code: "left",      label: "Sinistra" },
  { code: "right",     label: "Destra" },
  { code: "bilateral", label: "Bilaterale" },
  { code: "",          label: "Non lateralizzato" },
] as const;
