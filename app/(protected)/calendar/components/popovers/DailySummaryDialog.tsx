// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/popovers/DailySummaryDialog.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Modale "📋 Riepilogo di oggi" — mostra statistiche del giorno corrente:
//   • cards Eseguiti / Da fare / Non pagati
//   • breakdown incassi (fatturato vs contanti vs totale)
//   • elenco compatto di tutti gli appuntamenti del giorno
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  THEME, fmtTime, formatDMY, statusColor,
  type CalendarEvent,
} from "../../utils";
import StatusBadge from "@/src/components/StatusBadge";

export type DailySummaryData = {
  total: number;
  done: number;
  notDone: number;
  unpaid: number;
  invoicedTotal: number;
  cashTotal: number;
  grandTotal: number;
  events: CalendarEvent[];
};

export type DailySummaryDialogProps = {
  summary: DailySummaryData;
  onClose: () => void;
};

export default function DailySummaryDialog({
  summary, onClose,
}: DailySummaryDialogProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(30,64,175,0.35)",
        zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: "90vw",
          maxHeight: "85vh",
          overflowY: "auto",
          background: THEME.panelBg,
          borderRadius: 16,
          border: `2px solid ${THEME.border}`,
          boxShadow: "0 24px 64px rgba(30,64,175,0.2)",
          padding: "28px 24px",
          color: THEME.text,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: THEME.blue }}>📋 Riepilogo di oggi</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: THEME.muted, marginTop: 4 }}>
              {formatDMY(new Date())}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 38, height: 38, borderRadius: 10,
            border: `2px solid ${THEME.border}`,
            background: THEME.panelSoft,
            color: THEME.blue, cursor: "pointer",
            fontWeight: 800, fontSize: 14,
          }}>✕</button>
        </div>

        {/* Stats cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div style={{ padding: "14px 12px", borderRadius: 10, background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.2)", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: THEME.green }}>{summary.done}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: THEME.muted }}>Eseguiti</div>
          </div>
          <div style={{ padding: "14px 12px", borderRadius: 10, background: "rgba(234,88,12,0.08)", border: "1px solid rgba(234,88,12,0.2)", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: THEME.amber }}>{summary.notDone}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: THEME.muted }}>Da fare</div>
          </div>
          <div style={{ padding: "14px 12px", borderRadius: 10, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: THEME.red }}>{summary.unpaid}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: THEME.muted }}>Non pagati</div>
          </div>
        </div>

        {/* Revenue breakdown */}
        <div style={{ padding: "16px", borderRadius: 10, background: THEME.panelSoft, border: `1px solid ${THEME.borderSoft}`, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textSoft, marginBottom: 12 }}>
            Incassi del giorno
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
              <span style={{ color: THEME.muted }}>Fatturato</span>
              <span style={{ color: THEME.blue }}>€ {summary.invoicedTotal.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
              <span style={{ color: THEME.muted }}>Contanti</span>
              <span style={{ color: THEME.amber }}>€ {summary.cashTotal.toFixed(2)}</span>
            </div>
            <div style={{ borderTop: `1.5px solid ${THEME.border}`, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800 }}>
              <span>Totale</span>
              <span style={{ color: THEME.green }}>€ {summary.grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Event list */}
        <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textSoft, marginBottom: 8 }}>
          Dettaglio appuntamenti ({summary.total})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {summary.events.map(ev => (
            <div key={ev.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px", borderRadius: 8,
              background: `${statusColor(ev.status)}22`,
              borderLeft: `4px solid ${statusColor(ev.status)}`,
              fontSize: 12, fontWeight: 600,
            }}>
              <span style={{ color: THEME.muted, minWidth: 42 }}>{fmtTime(ev.start.toISOString())}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.patient_name}</span>
              <span style={{ color: ev.is_paid ? THEME.green : THEME.red, fontSize: 11, fontWeight: 700 }}>
                {ev.is_paid ? "💰" : "—"}
              </span>
              <StatusBadge status={ev.status} size="sm" />
            </div>
          ))}
          {summary.events.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: THEME.muted, fontWeight: 600 }}>
              Nessun appuntamento oggi
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
