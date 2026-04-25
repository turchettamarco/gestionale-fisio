// app/(protected)/settings/components/shared/theme.ts
// ═══════════════════════════════════════════════════════════════════════
// Theme, stili condivisi e utility per tutte le sezioni di Impostazioni.
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

export const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 7,
  border: `1.5px solid ${THEME.border}`, fontSize: 13, fontWeight: 500,
  outline: "none", background: "#fff", color: THEME.text, boxSizing: "border-box",
};

export const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700,
  color: THEME.muted, marginBottom: 4,
  textTransform: "uppercase", letterSpacing: 0.4,
};

export const cardStyle: React.CSSProperties = {
  background: THEME.panelBg, borderRadius: 12,
  border: `1px solid ${THEME.border}`,
  boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
  overflow: "hidden", marginBottom: 16,
};

export const sectionHead: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "16px 20px", cursor: "pointer",
  borderBottom: `1px solid ${THEME.border}`,
};
