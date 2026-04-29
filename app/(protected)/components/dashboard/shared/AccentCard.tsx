// app/(protected)/components/dashboard/shared/AccentCard.tsx
// ═══════════════════════════════════════════════════════════════════════
// Wrapper card standard. L'identità cromatica è data dall'header tinto
// dentro la card stessa (background rgba colorato leggero) e dai valori
// numerici colorati, NON da una barra laterale.
//
// Il prop `accent` viene mantenuto per retrocompatibilità con le chiamate
// esistenti ma è ignorato (no-op). Le card chiamanti già definiscono il
// colore dell'header e dei valori in modo autonomo.
// ═══════════════════════════════════════════════════════════════════════

import React from "react";

const cardShadow = "0 1px 3px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.04)";

export type AccentCardProps = {
  /** Colore della card (mantenuto per retrocompatibilità, attualmente ignorato) */
  accent?: string;
  children: React.ReactNode;
  marginBottom?: number;
  /** Background del corpo card (default: #fff) */
  bg?: string;
  /** Colore del bordo esterno (default: rgba(15,23,42,0.06)) */
  borderColor?: string;
  /** Box-shadow custom (default: shadow standard) */
  shadow?: string;
  /** Rotazione in deg, es. -0.3 per il post-it */
  rotate?: number;
};

export default function AccentCard({
  children,
  marginBottom = 0,
  bg = "#fff",
  borderColor = "rgba(15,23,42,0.06)",
  shadow = cardShadow,
  rotate,
}: AccentCardProps) {
  return (
    <div
      style={{
        background: bg,
        borderRadius: 12,
        border: `1px solid ${borderColor}`,
        boxShadow: shadow,
        overflow: "hidden",
        marginBottom,
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
      }}
    >
      {children}
    </div>
  );
}
