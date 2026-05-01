// app/(protected)/settings/components/shared/utils.ts
// ═══════════════════════════════════════════════════════════════════════
// Funzioni utility per parsing e formattazione (prezzi, validazioni).
// ═══════════════════════════════════════════════════════════════════════

export function toMoneyString(n: number | null | undefined, fallback: string): string {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return n.toFixed(2);
}

export function toNumberSafe(s: string, fallback: number): number {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function validatePrice(value: string): string {
  const clean = value.replace(/[^\d.,]/g, "");
  const normalized = clean.replace(",", ".");
  const parts = normalized.split(".");
  if (parts.length > 1) return `${parts[0]}.${parts[1].slice(0, 2)}`;
  return normalized || "0.00";
}

export function formatPreview(template: string): string {
  return template
    .replace(/{nome}/g, "Marco")
    .replace(/{data_relativa}/g, "Oggi")
    .replace(/{ora}/g, "10:30")
    .replace(/{luogo}/g, "Studio Pontecorvo, Via Galileo Galilei 5");
}
