// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/popovers/EventHoverTooltip.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Mini-scheda paziente che appare al hover prolungato (~600ms) su un
// appuntamento del calendario. Mostra orario, stato, telefono, diagnosi,
// trattamento, importo e nota.
//
// Lo stato di apertura/chiusura è gestito nel page.tsx (state hoverTooltip).
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  THEME, fmtTime, statusColor, statusLabel,
  type CalendarEvent,
} from "../../utils";

export type HoverTooltipState = {
  event: CalendarEvent;
  x: number;
  y: number;
};

export type EventHoverTooltipProps = {
  state: HoverTooltipState;
  onMouseLeave: () => void;
  /** Funzione che restituisce l'importo di default in mancanza di amount esplicito */
  getDefaultAmount: (
    tType: "seduta" | "macchinario",
    pType: "invoiced" | "cash"
  ) => number;
};

export default function EventHoverTooltip({
  state, onMouseLeave, getDefaultAmount,
}: EventHoverTooltipProps) {
  const { event, x, y } = state;

  // Posizionamento dinamico: evita di uscire dalla finestra
  const left = typeof window !== "undefined"
    ? Math.min(x, window.innerWidth - 290)
    : x;
  const top = typeof window !== "undefined"
    ? Math.min(y, window.innerHeight - 220)
    : y;

  return (
    <div
      onMouseEnter={() => { /* tieni visibile mentre si passa sopra */ }}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        left,
        top,
        width: 270,
        background: THEME.panelBg,
        border: `2px solid ${THEME.border}`,
        borderRadius: 12,
        boxShadow: "0 12px 40px rgba(30,64,175,0.18)",
        padding: "14px 16px",
        zIndex: 10000,
        fontSize: 12,
        fontWeight: 600,
        color: THEME.text,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: THEME.blue, marginBottom: 8 }}>
        {event.patient_name}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: THEME.muted }}>Orario</span>
          <span>{fmtTime(event.start.toISOString())} – {fmtTime(event.end.toISOString())}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: THEME.muted }}>Stato</span>
          <span style={{ color: statusColor(event.status), fontWeight: 700 }}>{statusLabel(event.status)}</span>
        </div>
        {event.patient_phone && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: THEME.muted }}>Telefono</span>
            <span>{event.patient_phone}</span>
          </div>
        )}
        {event.diagnosis && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: THEME.muted }}>Diagnosi</span>
            <span style={{ maxWidth: 150, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.diagnosis}</span>
          </div>
        )}
        {event.treatment && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: THEME.muted }}>Trattamento</span>
            <span>{event.treatment}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: THEME.muted }}>Tipo</span>
          <span>
            {event.treatment_type === "macchinario" ? "Macchinario" : "Seduta"}
            {" · "}
            {event.price_type === "cash" ? "Contanti" : "Fattura"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: THEME.muted }}>Importo</span>
          <span style={{ fontWeight: 800 }}>
            € {event.amount ?? getDefaultAmount(
              (event.treatment_type as "seduta" | "macchinario") || "seduta",
              (event.price_type as "invoiced" | "cash") || "invoiced"
            )}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: THEME.muted }}>Pagato</span>
          <span style={{ color: event.is_paid ? THEME.green : THEME.red, fontWeight: 700 }}>
            {event.is_paid ? "✓ Sì" : "✗ No"}
          </span>
        </div>
        {event.calendar_note && (
          <div style={{ marginTop: 4, padding: "6px 8px", background: THEME.panelSoft, borderRadius: 6, fontSize: 11, color: THEME.muted, lineHeight: 1.4 }}>
            📝 {event.calendar_note}
          </div>
        )}
      </div>
    </div>
  );
}
