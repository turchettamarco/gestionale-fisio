// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/calendar/components/panels/BookingRequestsPanel.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Pannello laterale che mostra le richieste di prenotazione arrivate dal
// sito pubblico (tabella booking_requests). Permette di:
//   • Confermare una richiesta in attesa  → crea l'appuntamento
//   • Annullarla
//   • Riaprire una confermata o annullata (rimette in pending)
//
// Lo stato apertura è gestito nel page.tsx (bookingPanel boolean).
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import type { BookingRequest } from "../../utils";

export type BookingRequestsPanelProps = {
  /** Lista richieste */
  requests: BookingRequest[];
  /** Caricamento iniziale in corso */
  loading: boolean;
  /** Id della richiesta su cui è in esecuzione un'azione (disabilita UI) */
  actionId: string | null;
  /** Chiude il pannello (click overlay o ✕) */
  onClose: () => void;
  /** Conferma una richiesta → crea appuntamento sul calendario */
  onConfirm: (req: BookingRequest) => void;
  /** Annulla una richiesta */
  onReject: (id: string) => void;
  /** Riapre una richiesta (rimette pending) */
  onReopen: (id: string) => void;
  /** Refresh lista */
  onRefresh: () => void;
};

export default function BookingRequestsPanel({
  requests, loading, actionId,
  onClose, onConfirm, onReject, onReopen, onRefresh,
}: BookingRequestsPanelProps) {
  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 48, background: "rgba(0,0,0,0.3)" }}
      />
      <div style={{
        position: "fixed", top: 66, right: 16, zIndex: 49,
        width: 380, maxHeight: "80vh", overflowY: "auto",
        background: "#fff", borderRadius: 14,
        border: "1.5px solid #e2e8f0",
        boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
      }}>
        {/* Header pannello */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>Prenotazioni dal sito</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
              {pendingCount} in attesa · {requests.length} totali
            </div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>

        {loading && (
          <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            Caricamento…
          </div>
        )}

        {!loading && requests.length === 0 && (
          <div style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>Nessuna prenotazione ricevuta</div>
          </div>
        )}

        {requests.map(req => {
          const isActing    = actionId === req.id;
          const isPending   = req.status === "pending";
          const isConfirmed = req.status === "confirmed";
          const isCancelled = req.status === "cancelled";
          const dateStr = new Date(req.requested_date + "T12:00:00")
            .toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" });
          const statusBadge = isPending
            ? { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa", label: "In attesa" }
            : isConfirmed
              ? { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0", label: "Confermata" }
              : { bg: "#fff5f5", color: "#dc2626", border: "#fecaca", label: "Annullata" };

          return (
            <div key={req.id} style={{ padding: "14px 18px", borderBottom: "1px solid #f1f5f9" }}>

              {/* Nome + data */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{req.patient_name}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{req.patient_phone}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0d9488" }}>{dateStr}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>{req.requested_time.slice(0, 5)}</div>
                </div>
              </div>

              {/* Servizio + badge stato */}
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11, background: "#f0fdfa", borderRadius: 6, padding: "3px 8px", color: "#0d9488", fontWeight: 700 }}>
                  {req.service_name} · {req.service_duration} min
                </div>
                <div style={{ fontSize: 10, background: statusBadge.bg, borderRadius: 99, padding: "2px 8px", color: statusBadge.color, fontWeight: 700, border: `1px solid ${statusBadge.border}` }}>
                  {statusBadge.label}
                </div>
              </div>

              {/* Note */}
              {req.notes && (
                <div style={{ fontSize: 11, color: "#64748b", fontStyle: "italic", marginBottom: 8 }}>
                  &quot;{req.notes}&quot;
                </div>
              )}

              {/* ── Azioni in attesa ── */}
              {isPending && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onConfirm(req)} disabled={isActing}
                    style={{ flex: 1, padding: "7px 0", border: "none", borderRadius: 7, background: "#0d9488", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: isActing ? 0.6 : 1 }}>
                    {isActing ? "…" : "✓ Conferma"}
                  </button>
                  <button onClick={() => onReject(req.id)} disabled={isActing}
                    style={{ flex: 1, padding: "7px 0", border: "1.5px solid #fecaca", borderRadius: 7, background: "#fff5f5", color: "#dc2626", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: isActing ? 0.6 : 1 }}>
                    {isActing ? "…" : "✕ Annulla"}
                  </button>
                </div>
              )}

              {/* ── Azioni confermata ── */}
              {isConfirmed && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onReject(req.id)} disabled={isActing}
                    style={{ flex: 1, padding: "7px 0", border: "1.5px solid #fecaca", borderRadius: 7, background: "#fff5f5", color: "#dc2626", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: isActing ? 0.6 : 1 }}>
                    {isActing ? "…" : "✕ Annulla"}
                  </button>
                  <button onClick={() => onReopen(req.id)} disabled={isActing}
                    style={{ flex: 1, padding: "7px 0", border: "1.5px solid #e2e8f0", borderRadius: 7, background: "#f8fafc", color: "#64748b", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: isActing ? 0.6 : 1 }}>
                    {isActing ? "…" : "↩ Riapri"}
                  </button>
                </div>
              )}

              {/* ── Azioni annullata ── */}
              {isCancelled && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onConfirm(req)} disabled={isActing}
                    style={{ flex: 1, padding: "7px 0", border: "none", borderRadius: 7, background: "#0d9488", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: isActing ? 0.6 : 1 }}>
                    {isActing ? "…" : "✓ Riconferma"}
                  </button>
                  <button onClick={() => onReopen(req.id)} disabled={isActing}
                    style={{ flex: 1, padding: "7px 0", border: "1.5px solid #e2e8f0", borderRadius: 7, background: "#f8fafc", color: "#64748b", fontWeight: 700, fontSize: 12, cursor: "pointer", opacity: isActing ? 0.6 : 1 }}>
                    {isActing ? "…" : "↩ Riapri"}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Footer refresh */}
        <div style={{ padding: "10px 18px", borderTop: "1px solid #f1f5f9" }}>
          <button onClick={onRefresh}
            style={{ width: "100%", padding: "7px", border: "1px solid #e2e8f0", borderRadius: 7, background: "#fff", color: "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            ↻ Aggiorna
          </button>
        </div>
      </div>
    </>
  );
}
