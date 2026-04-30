// src/lib/treatmentTypes.ts
//
// Catalogo dinamico dei tipi di trattamento (per studio).
//
// La tabella `treatment_types` sostituisce la lista hardcoded di 6 trattamenti
// (seduta, macchinario, laser, tecar, onde_urto, tens) con un catalogo
// configurabile per ogni studio: ogni studio può aggiungere voci nuove
// (es. "Linfodrenaggio Vodder"), modificare quelle esistenti, attivarle o
// disattivarle.
//
// Le 6 voci built-in vengono create automaticamente alla creazione di un nuovo
// studio (trigger DB `studios_seed_treatment_types`).
//
// Filosofia di backward compatibility:
//   - Le `key` delle 6 voci built-in sono identiche ai vecchi valori string
//     usati nel codice ("seduta", "macchinario", ecc.), quindi gli appuntamenti
//     già esistenti continuano a funzionare senza migrazioni di dati.
//   - Il tipo `TreatmentTypeKey` è ora `string` (non più union ristretta).

import { supabase } from "@/src/lib/supabaseClient";

// ─── Tipi ────────────────────────────────────────────────────────────────

export type TreatmentTypeKey = string;

export interface TreatmentTypeRow {
  id: string;
  studio_id: string;
  key: TreatmentTypeKey;
  label: string;
  color: string;
  price_invoice: number;
  price_cash: number;
  duration_min: number;
  is_active: boolean;
  sort_order: number;
  is_builtin: boolean;
  created_at?: string;
  updated_at?: string;
}

// ─── Loader ──────────────────────────────────────────────────────────────

/**
 * Carica tutti i tipi di trattamento di uno studio.
 *
 * @param studioId  uuid dello studio
 * @param onlyActive  se true (default: true) ritorna solo le voci attive
 * @returns array ordinato per `sort_order` ascendente
 */
export async function loadTreatmentTypes(
  studioId: string,
  onlyActive: boolean = true
): Promise<TreatmentTypeRow[]> {
  let query = supabase
    .from("treatment_types")
    .select("id, studio_id, key, label, color, price_invoice, price_cash, duration_min, is_active, sort_order, is_builtin, created_at, updated_at")
    .eq("studio_id", studioId)
    .order("sort_order", { ascending: true });

  if (onlyActive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[treatmentTypes] loadTreatmentTypes error:", error.message);
    return [];
  }
  return (data ?? []) as TreatmentTypeRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Trova un trattamento per chiave nel catalogo già caricato.
 * Ritorna `undefined` se non esiste o se è disattivato (a seconda dell'array passato).
 */
export function getTreatmentByKey(
  types: TreatmentTypeRow[],
  key: TreatmentTypeKey | null | undefined
): TreatmentTypeRow | undefined {
  if (!key) return undefined;
  return types.find(t => t.key === key);
}

/**
 * Ritorna il label da mostrare per una chiave. Se la chiave non è nel catalogo,
 * ritorna la chiave stessa "umanizzata" (es. "linfodrenaggio_vodder" → "Linfodrenaggio Vodder").
 * Utile per appuntamenti storici con un treatment_type ormai disattivato.
 */
export function labelForKey(
  types: TreatmentTypeRow[],
  key: TreatmentTypeKey | null | undefined
): string {
  if (!key) return "—";
  const found = types.find(t => t.key === key);
  if (found) return found.label;
  // Fallback: capitalize e rimpiazza underscore
  return key
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Ritorna il colore associato a una chiave, con fallback grigio neutro.
 */
export function colorForKey(
  types: TreatmentTypeRow[],
  key: TreatmentTypeKey | null | undefined
): string {
  if (!key) return "#94a3b8";
  const found = types.find(t => t.key === key);
  return found?.color ?? "#94a3b8";
}

/**
 * Ritorna durata in minuti per una chiave, con fallback 30 min.
 */
export function durationForKey(
  types: TreatmentTypeRow[],
  key: TreatmentTypeKey | null | undefined
): number {
  if (!key) return 30;
  const found = types.find(t => t.key === key);
  return found?.duration_min ?? 30;
}

/**
 * Ritorna il prezzo di default per chiave + tipo di pagamento.
 */
export function priceForKey(
  types: TreatmentTypeRow[],
  key: TreatmentTypeKey | null | undefined,
  priceType: "invoiced" | "cash"
): number {
  if (!key) return 0;
  const found = types.find(t => t.key === key);
  if (!found) return 0;
  return priceType === "invoiced" ? found.price_invoice : found.price_cash;
}

// ─── Conversione key → slug per nuove voci custom ────────────────────────

/**
 * Genera una `key` valida da un label libero scritto dall'utente.
 * Esempi:
 *   "Linfodrenaggio Vodder"   → "linfodrenaggio_vodder"
 *   "Massaggio Cervico-Dorsale" → "massaggio_cervico_dorsale"
 *   "Trattamento N.1"          → "trattamento_n_1"
 *
 * Garantisce: solo [a-z0-9_], niente caratteri speciali, niente accenti,
 * niente doppi underscore, niente underscore iniziali/finali.
 */
export function keyFromLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // rimuove accenti
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")     // tutto ciò che non è lettera/cifra → _
    .replace(/^_+|_+$/g, "")          // trim _
    .replace(/_+/g, "_")              // collassa _ multipli
    .slice(0, 60) || "trattamento";
}
