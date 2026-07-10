"use client";

// ═══════════════════════════════════════════════════════════════════════════
// FISIOHUB — SET ICONE SVG (Restyling mobile, Direzione A)
//
// Icone a tratto uniforme (stroke 2, round cap/join) al posto di emoji e
// glifi testuali, che renderizzano in modo diverso tra iOS e Android.
// Ereditano il colore da `color` e la dimensione dalla prop `size`.
//
// Uso:  <Icon name="home" size={19} color="#0d9488" />
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";

const PATHS: Record<string, React.ReactNode> = {
  // Navigazione
  home:     <path d="M5 12H3l9-9 9 9h-2M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M16 3v4M8 3v4M4 11h16" /></>,
  users:    <><path d="M9 7a4 4 0 1 0 8 0a4 4 0 0 0-8 0" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.85" /></>,
  chart:    <path d="M3 13a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM15 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1zM9 9a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z" />,
  plug:     <><path d="M9 7v4M15 7v4M12 3v4" /><path d="M7 11h10v2a5 5 0 0 1-10 0z" /><path d="M12 18v3" /></>,
  menu:     <path d="M4 6h16M4 12h16M4 18h16" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,

  // Azioni
  phone:    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  whatsapp: <><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9z" /><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" /></>,
  bell:     <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  plus:     <path d="M12 5v14M5 12h14" />,
  check:    <path d="M5 12l5 5L20 7" />,
  x:        <path d="M6 6l12 12M18 6L6 18" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronLeft:  <path d="M15 6l-6 6 6 6" />,
  chevronDown:  <path d="M6 9l6 6 6-6" />,
  refresh:  <><path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></>,
  search:   <><circle cx="10" cy="10" r="7" /><path d="M21 21l-6-6" /></>,
  edit:     <><path d="M4 20h4L18.5 9.5a2.83 2.83 0 0 0-4-4L4 16v4" /><path d="M13.5 6.5l4 4" /></>,
  clock:    <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  euro:     <><path d="M17.2 7a6 6 0 1 0 0 10" /><path d="M4 10h9M4 14h9" /></>,
  logout:   <><path d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2" /><path d="M21 12H9M18 9l3 3-3 3" /></>,
  undo:     <><path d="M9 14l-4-4 4-4" /><path d="M5 10h11a4 4 0 0 1 0 8h-1" /></>,

  // Firma del brand (pulse-line del logo)
  pulse:    <polyline points="3 12 7 12 10 6 14 18 17 12 21 12" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  color = "currentColor",
  strokeWidth = 2,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0, ...style }}
    >
      {PATHS[name]}
    </svg>
  );
}

// Divisore pulse-line: la firma discreta del brand accanto ai titoli sezione.
export function PulseDivider({ width = 46, color = "#E0D8C8" }: { width?: number; color?: string }) {
  return (
    <svg width={width} height={12} viewBox="0 0 46 12" fill="none" stroke={color}
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}>
      <polyline points="1 6 12 6 17 2 23 10 28 6 45 6" />
    </svg>
  );
}
