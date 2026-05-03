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
  THEME, fmtTime,
  type CalendarEvent,
} from "../../utils";
import StatusBadge from "@/src/components/StatusBadge";

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

  // ─── Tooltip per appuntamenti di GRUPPO (mig. 014) ───────────────
  if (event.is_group) {
    const participants = event.participants ?? [];
    const count = participants.length;
    const max = event.group_max_participants ?? 0;
    const pricePP = event.group_price_per_person ?? 0;
    const total = participants.reduce((sum, p) => sum + (Number(p.price) || 0), 0)
      || (count * pricePP);
    const paidCount = participants.filter((p) => p.payment_status === "paid").length;

    return (
      <div
        onMouseLeave={onMouseLeave}
        style={{
          position: "fixed",
          left, top,
          width: 280,
          background: THEME.panelBg,
          border: `2px solid ${THEME.teal}`,
          borderRadius: 12,
          boxShadow: "0 12px 40px rgba(13,148,136,0.25)",
          padding: 0,
          zIndex: 10000,
          fontSize: 12,
          fontWeight: 600,
          color: THEME.text,
          overflow: "hidden",
        }}
      >
        {/* Header gradient */}
        <div style={{
          background: "linear-gradient(135deg, #0d9488 0%, #06b6d4 100%)",
          padding: "10px 14px", color: "#fff",
        }}>
          <div style={{
            display: "inline-block", background: "rgba(255,255,255,0.25)",
            padding: "1px 7px", borderRadius: 99, fontSize: 9, fontWeight: 800,
            letterSpacing: 0.5, marginBottom: 4,
          }}>
            👥 GRUPPO · {count}/{max}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>
            {event.group_title || "Gruppo"}
          </div>
          <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>
            {fmtTime(event.start.toISOString())} – {fmtTime(event.end.toISOString())}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: `1px solid ${THEME.border}` }}>
          <div style={{ padding: "8px 4px", textAlign: "center", borderRight: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 9, color: THEME.muted, textTransform: "uppercase" }}>Pagati</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: paidCount === count && count > 0 ? THEME.green : THEME.text }}>
              {paidCount}/{count}
            </div>
          </div>
          <div style={{ padding: "8px 4px", textAlign: "center", borderRight: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 9, color: THEME.muted, textTransform: "uppercase" }}>€/persona</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>
              {pricePP.toFixed(0)}€
            </div>
          </div>
          <div style={{ padding: "8px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: THEME.muted, textTransform: "uppercase" }}>Totale</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: THEME.teal }}>
              {total.toFixed(0)}€
            </div>
          </div>
        </div>

        {/* Lista partecipanti compatta */}
        <div style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 10, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Partecipanti
          </div>
          {count === 0 ? (
            <div style={{ fontSize: 11, color: THEME.muted, fontStyle: "italic", textAlign: "center", padding: "8px 0" }}>
              Nessun partecipante. Clicca per aggiungerne.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflow: "auto" }}>
              {participants.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                  <span style={{ color: THEME.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.payment_status === "paid" ? "✓ " : "○ "}
                    {p.patient_last_name ?? ""} {p.patient_first_name ?? ""}
                  </span>
                  <span style={{
                    color: p.payment_status === "paid" ? THEME.green : THEME.muted,
                    fontWeight: 700, flexShrink: 0, marginLeft: 8,
                  }}>
                    {Number(p.price).toFixed(0)}€
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {event.calendar_note && (
          <div style={{ margin: "0 14px 10px", padding: "6px 8px", background: THEME.panelSoft, borderRadius: 6, fontSize: 11, color: THEME.muted, lineHeight: 1.4 }}>
            📝 {event.calendar_note}
          </div>
        )}
      </div>
    );
  }

  // ─── Tooltip standard (appuntamento singolo) ─────────────────────

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: THEME.muted }}>Stato</span>
          <StatusBadge status={event.status} size="sm" />
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
