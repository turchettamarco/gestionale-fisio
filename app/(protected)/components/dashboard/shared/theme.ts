// app/(protected)/components/dashboard/shared/theme.ts
// ═══════════════════════════════════════════════════════════════════════
// Tema, costanti orari di lavoro e stili condivisi della dashboard.
// ═══════════════════════════════════════════════════════════════════════

import type React from "react";

export const THEME = {
  appBg:     "var(--fh-bg)",
  panelBg:   "var(--fh-card)",
  panelSoft: "var(--fh-soft)",
  text:      "var(--fh-text)",
  textSoft:  "var(--fh-ink)",
  muted:     "var(--fh-mut)",
  border:    "var(--fh-border)",
  blue:      "#2563eb",
  blueDark:  "#1e40af",
  green:     "#16a34a",
  teal:      "#0d9488",
  red:       "#dc2626",
  amber:     "#f97316",
  gray:      "var(--fh-faint)",
};

// Range orario di lavoro (per slot liberi)
export const WORK_START = 8;
export const WORK_END   = 20;

// Stili input riutilizzati dalla form di modifica orario nel "prossimo appuntamento"
export const inpStyle: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 6,
  border: `1.5px solid ${THEME.border}`,
  fontSize: 12, fontWeight: 600,
  outline: "none", background: "var(--fh-card)", color: THEME.text,
};
