// app/(protected)/settings/components/shared/theme.ts
// ═══════════════════════════════════════════════════════════════════════
// Theme, stili condivisi e utility per tutte le sezioni di Impostazioni.
// ═══════════════════════════════════════════════════════════════════════

import type React from "react";

export const THEME = {
  appBg:     "#F4F1E9",   // cream
  panelBg:   "#FFFFFF",   // card
  panelSoft: "#FBF9F3",   // fascia/sfondo morbido caldo
  text:      "#1E2A2B",   // inchiostro teal-carbone
  textSoft:  "#2B3838",
  muted:     "#6E7B79",   // grigio caldo
  border:    "#E5DFD2",   // hairline calda
  blue:      "#2563eb",
  blueDark:  "#1e40af",
  green:     "#16a34a",
  teal:      "#0d9488",
  tealDark:  "#0B6557",
  brass:     "#AE8A4E",   // accento caldo
  red:       "#dc2626",
  amber:     "#f97316",
  gray:      "#9AA6A3",
};

export const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 7,
  border: `1px solid ${THEME.border}`, fontSize: 13, fontWeight: 500,
  outline: "none", background: "#fff", color: THEME.text, boxSizing: "border-box",
};

export const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700,
  color: THEME.muted, marginBottom: 4,
  textTransform: "uppercase", letterSpacing: 0.4,
};

export const cardStyle: React.CSSProperties = {
  background: THEME.panelBg, borderRadius: 10,
  border: `1px solid ${THEME.border}`,
  boxShadow: "none",
  overflow: "hidden", marginBottom: 14,
};

export const sectionHead: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "16px 20px", cursor: "pointer",
  borderBottom: `1px solid ${THEME.border}`,
};
