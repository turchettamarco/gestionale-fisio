// app/(protected)/components/dashboard/shared/theme.ts
// ═══════════════════════════════════════════════════════════════════════
// Tema, costanti orari di lavoro e stili condivisi della dashboard.
// ═══════════════════════════════════════════════════════════════════════

import type React from "react";

export const THEME = {
  appBg:     "#f1f5f9",
  panelBg:   "#ffffff",
  panelSoft: "#f7f9fd",
  text:      "#0f172a",
  textSoft:  "#1e293b",
  muted:     "#334155",
  border:    "#cbd5e1",
  blue:      "#2563eb",
  blueDark:  "#1e40af",
  green:     "#16a34a",
  teal:      "#0d9488",
  red:       "#dc2626",
  amber:     "#f97316",
  gray:      "#94a3b8",
};

// Range orario di lavoro (per slot liberi)
export const WORK_START = 8;
export const WORK_END   = 20;

// Stili input riutilizzati dalla form di modifica orario nel "prossimo appuntamento"
export const inpStyle: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 6,
  border: `1.5px solid ${THEME.border}`,
  fontSize: 12, fontWeight: 600,
  outline: "none", background: "#fff", color: THEME.text,
};
