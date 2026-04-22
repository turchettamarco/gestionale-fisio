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

export const DEFAULT_CLINIC_SITE = "Studio Pontecorvo";

// Link Google Reviews fallback — sostituibile nelle impostazioni studio
export const GOOGLE_REVIEW_LINK_FALLBACK =
  "https://www.google.com/maps/place//data=!4m3!3m2!1s0x133ab7000a9c53d3:0xf706ba51f69901bf!12e1?source=g.page.m.ia._&laa=nmx-review-solicitation-ia2";

export const CLINIC_ADDRESSES: Record<string, string> = {
  "Studio Pontecorvo": "Pontecorvo, Via Galileo Galilei 5, dietro il Bar Principe",
};

export const ALL_TREATMENTS: { value: TreatmentType; label: string; color: string }[] = [
  { value: "seduta",      label: "Seduta",      color: "#0d9488" },
  { value: "macchinario", label: "Macchinario", color: "#2563eb" },
  { value: "laser",       label: "Laser",       color: "#d97706" },
  { value: "tecar",       label: "Tecar",       color: "#ea580c" },
  { value: "onde_urto",   label: "Onde d'urto", color: "#7c3aed" },
  { value: "tens",        label: "TENS",        color: "#059669" },
];

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
  return found ? found.label : "Seduta";
}

export function asTreatmentType(v: string | null | undefined): TreatmentType {
  const found = ALL_TREATMENTS.find(t => t.value === v);
  return found ? found.value : "seduta";
}

export function asPriceType(v: string | null | undefined): "invoiced" | "cash" {
  return v === "cash" ? "cash" : "invoiced";
}
