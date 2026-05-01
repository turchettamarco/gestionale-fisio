// app/(protected)/settings/components/shared/Buttons.tsx
// ═══════════════════════════════════════════════════════════════════════
// Bottoni condivisi tra le sezioni di Impostazioni.
// ═══════════════════════════════════════════════════════════════════════

import type React from "react";
import { THEME } from "./theme";

export function BtnPrimary({
  label, onClick, disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "9px 20px", borderRadius: 7, border: "none",
        background: disabled ? THEME.gray : "linear-gradient(135deg, #0d9488, #2563eb)",
        color: "#fff", fontWeight: 700, fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "0 2px 8px rgba(13,148,136,0.2)",
      }}
    >
      {label}
    </button>
  );
}

export function BtnOutline({
  label, onClick, color = THEME.muted, disabled = false,
}: {
  label: string;
  onClick: () => void;
  color?: string;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "9px 16px", borderRadius: 7, border: `1px solid ${THEME.border}`,
        background: "#fff", color, fontWeight: 700, fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
