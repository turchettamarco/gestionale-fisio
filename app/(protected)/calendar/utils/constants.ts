// Costanti e tema del calendario

import type { TreatmentType, Status } from "./types";

export const THEME = {
  appBg: "#f1f5f9",
  panelBg: "#ffffff",
  panelSoft: "#f7f9fd",
  cardBg: "#ffffff",

  text: "#0f172a",
  textSoft: "#1e293b",
  muted: "#334155",

  border: "#cbd5e1",
  borderSoft: "#94a3b8",

  blue: "#2563eb",
  blueDark: "#1e40af",
  green: "#16a34a",
  greenDark: "#15803d",
  teal: "#0d9488",
  tealDark: "#0f766e",
  patientsAccent: "#0d9488",
  purple: "#7c3aed",

  red: "#dc2626",
  amber: "#f97316",
  gray: "#94a3b8",
};

export const DEFAULT_CLINIC_SITE = "Studio";

// Link Google Reviews fallback — sostituibile nelle impostazioni studio
export const GOOGLE_REVIEW_LINK_FALLBACK =
  "https://www.google.com/maps/place//data=!4m3!3m2!1s0x133ab7000a9c53d3:0xf706ba51f69901bf!12e1?source=g.page.m.ia._&laa=nmx-review-solicitation-ia2";

// Mappa indirizzi clinici legacy (single-tenant). Mantenuta vuota come
// fallback architetturale: ogni studio ha il proprio `studios.address`
// nel DB, che ha sempre la priorità nei messaggi WhatsApp/promemoria.
// Se in futuro serve gestire studi multi-sede, va creata la tabella
// `clinic_sites` collegata a `studios.id`, non si torna a hardcodare qui.
export const CLINIC_ADDRESSES: Record<string, string> = {};

/**
 * Catalogo trattamenti.
 *
 * Inizialmente popolato con i 6 built-in di sistema come fallback.
 * Una volta che il calendario carica il catalogo dal DB (treatment_types),
 * chiama `setTreatmentCatalog(...)` per aggiornare ovunque (compresi gli
 * helper sotto, che restano sincroni e leggono da questo array).
 *
 * Nota: si tratta di un singleton mutabile in memoria. Va bene perché:
 *   - viene popolato una volta al mount del calendario;
 *   - il calendario è single-tenant per sessione (uno studio attivo).
 */
export let ALL_TREATMENTS: { value: TreatmentType; label: string; color: string }[] = [
  { value: "seduta",      label: "Seduta",      color: "#0d9488" },
  { value: "macchinario", label: "Macchinario", color: "#2563eb" },
  { value: "laser",       label: "Laser",       color: "#d97706" },
  { value: "tecar",       label: "Tecar",       color: "#ea580c" },
  { value: "onde_urto",   label: "Onde d'urto", color: "#7c3aed" },
  { value: "tens",        label: "TENS",        color: "#059669" },
];

/**
 * Aggiorna il catalogo trattamenti runtime (chiamato dal calendario dopo
 * aver caricato `treatment_types` dal DB).
 */
export function setTreatmentCatalog(
  rows: { value: string; label: string; color: string }[]
): void {
  if (!rows || rows.length === 0) return; // mai svuotare → resta il fallback
  ALL_TREATMENTS = rows.slice();
}

// ─── Status helpers ──────────────────────────────────────────────────────

export function statusColor(status: Status): string {
  switch (status) {
    case "done":      return THEME.green;
    case "confirmed": return THEME.blue;
    case "not_paid":  return THEME.amber;
    case "cancelled": return THEME.gray;
    case "booked":
    default:          return THEME.red;
  }
}

export function statusBg(status: Status): string {
  switch (status) {
    case "done":      return "#16a34a";
    case "confirmed": return "#2563eb";
    case "not_paid":  return "#f97316";
    case "cancelled": return "#94a3b8";
    case "booked":
    default:          return "#dc2626";
  }
}

export function statusLabel(status: Status): string {
  switch (status) {
    case "confirmed": return "Confermato";
    case "done":      return "Eseguito";
    case "not_paid":  return "Non pagata";
    case "cancelled": return "Annullato";
    default:          return "Prenotato";
  }
}

// ─── Treatment helpers ───────────────────────────────────────────────────

export function getTreatmentColor(tt: string | null | undefined): string {
  const found = ALL_TREATMENTS.find(t => t.value === tt);
  return found ? found.color : "#2563eb";
}

export function getTreatmentLabel(tt: string | null | undefined): string {
  const found = ALL_TREATMENTS.find(t => t.value === tt);
  if (found) return found.label;
  // Fallback: capitalizza la chiave (es. "linfodrenaggio_vodder" → "Linfodrenaggio Vodder")
  if (!tt) return "Seduta";
  return tt
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function asTreatmentType(v: string | null | undefined): TreatmentType {
  // Restituisce il valore così com'è se valido, altrimenti il primo del catalogo (di solito "seduta")
  if (v && typeof v === "string" && v.length > 0) return v;
  return ALL_TREATMENTS[0]?.value ?? "seduta";
}

export function asPriceType(v: string | null | undefined): "invoiced" | "cash" {
  return v === "cash" ? "cash" : "invoiced";
}
