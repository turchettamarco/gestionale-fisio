// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/popovers/MonthDayPopover.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Popover che si apre cliccando un giorno nella vista MENSILE.
// Mostra l'elenco compatto degli appuntamenti di quel giorno.
// Click su un appuntamento → naviga alla vista giorno.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  THEME, fmtTime, formatDMY, statusColor, statusLabel,
  type CalendarEvent,
} from "../../utils";

export type MonthPopoverState = {
  day: Date;
  events: CalendarEvent[];
  x: number;
  y: number;
};

export type MonthDayPopoverProps = {
  state: MonthPopoverState;
  onClose: () => void;
  /** Quando l'utente clicca un appuntamento: chiamato con la data dell'evento */
  onSelectEvent: (event: CalendarEvent) => void;
};

export default function MonthDayPopover({
  state, onClose, onSelectEvent,
}: MonthDayPopoverProps) {
  // Posizionamento dinamico
  const winW = typeof window !== "undefined" ? window.innerWidth : 800;
  const winH = typeof window !== "undefined" ? window.innerHeight : 600;
  const left = Math.min(state.x, winW - 320);
  const top  = Math.min(state.y, winH - 300);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 9998 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left,
          top,
          width: 300,
          maxHeight: 340,
          overflowY: "auto",
          background: THEME.panelBg,
          border: `2px solid ${THEME.border}`,
          borderRadius: 12,
          boxShadow: "0 12px 40px rgba(30,64,175,0.18)",
          padding: "14px 16px",
          zIndex: 9999,
          color: THEME.text,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: THEME.blue, marginBottom: 10 }}>
          {formatDMY(state.day)} — {state.events.length} appuntamenti
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {state.events.map(ev => (
            <div
              key={ev.id}
              onClick={() => onSelectEvent(ev)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", borderRadius: 8,
                background: `${statusColor(ev.status)}22`,
                borderLeft: `4px solid ${statusColor(ev.status)}`,
                fontSize: 12, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <span style={{ color: THEME.muted, minWidth: 40 }}>
                {fmtTime(ev.start.toISOString())}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: THEME.text }}>
                {ev.calendar_note?.startsWith("[WEB|") && (
                  <span style={{
                    fontSize: 8, background: statusColor(ev.status), color: "#fff",
                    borderRadius: 3, padding: "1px 3px", marginRight: 3,
                    fontWeight: 700, verticalAlign: "middle",
                  }}>WEB</span>
                )}
                {ev.patient_name}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(ev.status) }}>
                {statusLabel(ev.status)}
              </span>
              <span>{ev.is_paid ? "💰" : ""}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: THEME.muted, textAlign: "center" }}>
          Click su un appuntamento → vista giorno
        </div>
      </div>
    </div>
  );
}
