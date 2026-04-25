// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/popovers/QuickActionsMenu.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Menu contestuale a comparsa (right-click / pressione lunga) che mostra
// azioni rapide:
//   • Se invocato su un APPUNTAMENTO esistente:
//       - Segna come eseguito
//       - Invia WhatsApp
//       - Duplica
//   • Se invocato su uno SLOT VUOTO:
//       - Nuovo appuntamento
//
// Lo stato di apertura/chiusura è gestito nel page.tsx (state quickActionsMenu).
// Il page.tsx già installa un listener globale "click" per chiuderlo.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  THEME,
  type CalendarEvent,
} from "../../utils";

export type QuickActionsMenuState = {
  x: number;
  y: number;
  /** Se presente, le azioni sono per quell'evento; altrimenti è per slot vuoto */
  eventId?: string;
};

export type QuickActionsMenuProps = {
  state: QuickActionsMenuState;
  /** Lista appuntamenti correnti (per recuperare l'evento dato il suo id) */
  events: CalendarEvent[];
  /** Chiude il menu (senza compiere azioni) */
  onClose: () => void;
  /** Toggle stato eseguito */
  onToggleDone: (eventId: string, currentStatus: CalendarEvent["status"]) => void;
  /** Invia promemoria WA */
  onSendReminder: (eventId: string, phone?: string, firstName?: string) => void;
  /** Duplica un appuntamento esistente */
  onDuplicate: (event: CalendarEvent) => void;
  /** Crea nuovo appuntamento (slot vuoto, default oggi) */
  onCreateNew: () => void;
};

const itemStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  border: "none",
  background: "transparent",
  color: THEME.text,
  cursor: "pointer",
  fontWeight: 600,
  textAlign: "left",
  fontSize: 13,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const itemWithBorder: React.CSSProperties = {
  ...itemStyle,
  borderBottom: `1.5px solid ${THEME.border}`,
};

export default function QuickActionsMenu({
  state, events,
  onClose, onToggleDone, onSendReminder, onDuplicate, onCreateNew,
}: QuickActionsMenuProps) {

  const event = state.eventId
    ? events.find(e => e.id === state.eventId)
    : null;

  return (
    <div
      style={{
        position: "fixed",
        top: state.y,
        left: state.x,
        background: THEME.panelBg,
        border: `2px solid ${THEME.border}`,
        borderRadius: 12,
        boxShadow: "0 8px 28px rgba(30,64,175,0.14)",
        zIndex: 10000,
        minWidth: 200,
        overflow: "hidden",
      }}
    >
      {event ? (
        <>
          <button
            onClick={() => {
              onToggleDone(event.id, event.status);
              onClose();
            }}
            style={itemWithBorder}
          >
            ✅ Segna come eseguito
          </button>

          <button
            onClick={() => {
              onSendReminder(
                event.id,
                event.patient_phone ?? undefined,
                event.patient_first_name ?? undefined
              );
              onClose();
            }}
            style={itemWithBorder}
          >
            ◈ Invia WhatsApp
          </button>

          <button
            onClick={() => {
              onDuplicate(event);
              onClose();
            }}
            style={itemStyle}
          >
            ◫ Duplica
          </button>
        </>
      ) : (
        <button
          onClick={() => {
            onCreateNew();
            onClose();
          }}
          style={itemStyle}
        >
          ◈ Nuovo appuntamento
        </button>
      )}
    </div>
  );
}
