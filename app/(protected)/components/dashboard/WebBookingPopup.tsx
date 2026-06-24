// app/(protected)/components/dashboard/WebBookingPopup.tsx
// ═══════════════════════════════════════════════════════════════════════
// Modale di dettaglio per una prenotazione arrivata dal sito.
// Permette: conferma (crea l'appuntamento), rifiuta, riconferma, elimina.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME } from "./shared/theme";
import { openWA } from "./shared/utils";
import { usePrivacyMode, useDisplayPatientPhone, usePrivacyDisplay } from "@/src/contexts/PrivacyModeContext";
import type { WebBooking } from "./shared/types";

export type WebBookingPopupProps = {
  booking: WebBooking;
  webBookingActionId: string | null;
  onClose: () => void;
  onConfirm: (b: WebBooking) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function WebBookingPopup(p: WebBookingPopupProps) {
  const b = p.booking;
  const { privacyMode } = usePrivacyMode();
  const displayPhone = useDisplayPatientPhone();
  const { maskName, maskInitial } = usePrivacyDisplay();
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, boxShadow: "0 24px 64px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        {/* Header popup */}
        <div style={{ background: "linear-gradient(135deg,#7c3aed,#2563eb)", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>🌐 Prenotazione dal sito</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              Richiesta ricevuta il {new Date(b.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
            </div>
          </div>
          <button onClick={p.onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, width: 30, height: 30, color: "#fff", fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>

        {/* Body popup */}
        <div style={{ padding: "18px 20px" }}>
          {/* Nome e telefono */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#7c3aed,#2563eb)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff", fontWeight: 800, flexShrink: 0 }}>
              {privacyMode ? maskInitial(b.patient_name) : b.patient_name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: THEME.text }}>{privacyMode ? maskName(b.patient_name) : b.patient_name}</div>
              <a href={`tel:${b.patient_phone}`} style={{ fontSize: 13, color: THEME.teal, fontWeight: 700, textDecoration: "none" }}>📞 {displayPhone(b.patient_phone)}</a>
              {b.patient_email && <div style={{ fontSize: 11, color: THEME.muted, marginTop: 1 }}>{b.patient_email}</div>}
            </div>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); openWA(b.patient_phone, ""); }}
              style={{ padding: "8px 14px", borderRadius: 8, background: "#25d366", color: "#fff", fontWeight: 700, fontSize: 12, textDecoration: "none" }}
            >WA</a>
          </div>

          {/* Dettagli appuntamento */}
          {[
            { l: "Servizio", v: b.service_name },
            { l: "Data",     v: new Date(b.requested_date + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) },
            { l: "Ora",      v: b.requested_time.slice(0, 5) },
            { l: "Durata",   v: `${b.service_duration} minuti` },
          ].map(r => (
            <div key={r.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ fontSize: 12, color: THEME.muted }}>{r.l}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: THEME.text }}>{r.v}</span>
            </div>
          ))}

          {b.notes && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: "#fffbeb", borderRadius: 7, border: "1px solid #fde68a", fontSize: 12, color: "#92400e", fontStyle: "italic" }}>
              📝 &quot;{b.notes}&quot;
            </div>
          )}

          {/* Badge stato */}
          <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
            {b.status === "pending"   && <span style={{ fontSize: 11, fontWeight: 700, color: "#c2410c", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 99, padding: "3px 12px" }}>In attesa di conferma</span>}
            {b.status === "confirmed" && <span style={{ fontSize: 11, fontWeight: 700, color: "#15803d", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 99, padding: "3px 12px" }}>Confermata</span>}
            {b.status === "cancelled" && <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 99, padding: "3px 12px" }}>Annullata</span>}
          </div>
        </div>

        {/* Footer popup — azioni */}
        <div style={{ padding: "12px 20px 18px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 10 }}>
          {b.status === "pending" && (
            <>
              <button
                onClick={() => p.onConfirm(b)}
                disabled={!!p.webBookingActionId}
                style={{ flex: 2, padding: "11px", border: "none", borderRadius: 10, background: "linear-gradient(135deg,#0d9488,#2563eb)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: p.webBookingActionId ? 0.6 : 1 }}
              >
                {p.webBookingActionId ? "Confermo…" : "✓ Conferma e crea appuntamento"}
              </button>
              <button
                onClick={() => p.onReject(b.id)}
                disabled={!!p.webBookingActionId}
                style={{ flex: 1, padding: "11px", border: "1.5px solid #fecaca", borderRadius: 10, background: "#fff5f5", color: "#dc2626", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: p.webBookingActionId ? 0.6 : 1 }}
              >
                ✕ Rifiuta
              </button>
              <button
                onClick={() => p.onDelete(b.id)}
                disabled={!!p.webBookingActionId}
                title="Elimina definitivamente"
                style={{ padding: "11px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: p.webBookingActionId ? 0.6 : 1 }}
              >
                🗑
              </button>
            </>
          )}
          {b.status === "confirmed" && (
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              <button onClick={() => p.onReject(b.id)} disabled={!!p.webBookingActionId}
                style={{ flex: 1, padding: "11px", border: "1.5px solid #fecaca", borderRadius: 10, background: "#fff5f5", color: "#dc2626", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                ✕ Annulla
              </button>
              <button onClick={() => p.onDelete(b.id)} disabled={!!p.webBookingActionId}
                style={{ flex: 1, padding: "11px", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                🗑 Elimina
              </button>
            </div>
          )}
          {b.status === "cancelled" && (
            <div style={{ display: "flex", gap: 8, flex: 1 }}>
              <button onClick={() => p.onConfirm(b)} disabled={!!p.webBookingActionId}
                style={{ flex: 1, padding: "11px", border: "none", borderRadius: 10, background: THEME.teal, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                ↩ Riconferma
              </button>
              <button onClick={() => p.onDelete(b.id)} disabled={!!p.webBookingActionId}
                style={{ flex: 1, padding: "11px", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                🗑 Elimina
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
