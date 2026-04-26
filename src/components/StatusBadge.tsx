// ═══════════════════════════════════════════════════════════════════════
// src/components/StatusBadge.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Badge unificato per visualizzare lo stato di un appuntamento
// nelle liste, popover, dialog, ecc.
//
// Forma standard:
//   ┌─────────────────┐
//   │ ● Eseguito      │   ← pillola colore tenue + dot pieno
//   └─────────────────┘
//
// Vantaggi rispetto a usare statusLabel/statusColor diretti:
//   • Uniformità visiva: stessa forma e dimensione ovunque
//   • Colori semantici coerenti
//   • Auto-leggibile: dot scuro + sfondo chiaro + testo scuro
//
// Uso:
//   <StatusBadge status="done" />            // size default "md"
//   <StatusBadge status="not_paid" size="sm" />
//
// ═══════════════════════════════════════════════════════════════════════

import type { Status } from "@/app/(protected)/calendar/utils";

export type StatusBadgeProps = {
  status: Status;
  /** "sm" = compatto (~10px font), "md" = default (~11px font) */
  size?: "sm" | "md";
  /** Override stile (es. marginLeft) */
  style?: React.CSSProperties;
};

// ─── Mappa stato → colori e label ───────────────────────────────────────
//   bg     = sfondo pillola (chiaro, ~50 della rampa)
//   dot    = pallino piccolo (medio, ~600 della rampa)
//   text   = testo pillola (scuro, ~800 della rampa)
//   label  = etichetta in italiano
//
// I colori sono scelti per essere semanticamente intuitivi:
//   • booked     → AMBRA (in attesa, da fare)
//   • confirmed  → BLU   (info, programmato)
//   • done       → VERDE (completato, OK)
//   • not_paid   → ROSSO (problema, attenzione)
//   • cancelled  → GRIGIO (neutralizzato)
const STYLES: Record<Status, { bg: string; dot: string; text: string; label: string }> = {
  booked: {
    bg:    "#FAEEDA",
    dot:   "#BA7517",
    text:  "#633806",
    label: "Prenotato",
  },
  confirmed: {
    bg:    "#E6F1FB",
    dot:   "#378ADD",
    text:  "#0C447C",
    label: "Confermato",
  },
  done: {
    bg:    "#EAF3DE",
    dot:   "#639922",
    text:  "#27500A",
    label: "Eseguito",
  },
  not_paid: {
    bg:    "#FCEBEB",
    dot:   "#E24B4A",
    text:  "#791F1F",
    label: "Non pagato",
  },
  cancelled: {
    bg:    "#F1EFE8",
    dot:   "#888780",
    text:  "#444441",
    label: "Annullato",
  },
};

export default function StatusBadge({ status, size = "md", style }: StatusBadgeProps) {
  const s = STYLES[status];
  const fontSize = size === "sm" ? 10 : 11;
  const dotSize  = size === "sm" ? 5  : 6;
  const padX     = size === "sm" ? 7  : 9;
  const padY     = size === "sm" ? 2  : 3;

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: `${padY}px ${padX}px`,
      borderRadius: 99,
      background: s.bg,
      color: s.text,
      fontSize,
      fontWeight: 700,
      lineHeight: 1.2,
      whiteSpace: "nowrap",
      ...style,
    }}>
      <span style={{
        width: dotSize,
        height: dotSize,
        borderRadius: "50%",
        background: s.dot,
        flexShrink: 0,
      }} />
      {s.label}
    </span>
  );
}
