"use client";
// app/(protected)/components/dashboard/CashCloseModal.tsx
// ═══════════════════════════════════════════════════════════════════════
// 💶 Chiusura cassa — il rito di fine giornata in un click:
//   • totale incassato oggi, spezzato per metodo (contanti / POS / bonifico)
//   • lista dei NON pagati con PaidPill per sistemarli al volo
//   • conteggio sedute fatte. Rispetta la Modalità Privacy.
// ═══════════════════════════════════════════════════════════════════════

import { THEME } from "./shared/theme";
import { fmtTime, money, patientName, pickPatient } from "./shared/utils";
import { usePrivacyMode, usePrivacyDisplay } from "@/src/contexts/PrivacyModeContext";
import PaidPill from "@/src/components/PaidPill";
import type { PaymentMethod } from "@/src/components/PaidPopover";
import type { AppointmentRow } from "./shared/types";

const METHOD_LABEL: Record<string, string> = {
  cash: "💵 Contanti",
  pos: "💳 POS",
  bank_transfer: "🏦 Bonifico",
};

export default function CashCloseModal({ open, onClose, appts, onUpdatePayment }: {
  open: boolean;
  onClose: () => void;
  appts: AppointmentRow[];               // appuntamenti di oggi
  onUpdatePayment: (id: string, next: { is_paid: boolean; paid_at: string | null; payment_method: PaymentMethod | null }) => void;
}) {
  const { privacyMode } = usePrivacyMode();
  const { maskName } = usePrivacyDisplay();
  if (!open) return null;

  const nameOf = (a: AppointmentRow) =>
    privacyMode ? maskName(pickPatient(a.patients)) : patientName(a.patients);
  const amt = (a: AppointmentRow) => {
    const n = a.amount != null && a.amount !== "" ? Number(a.amount) : 0;
    return Number.isNaN(n) ? 0 : n;
  };

  const valid = appts.filter(a => a.status !== "cancelled" && amt(a) > 0);
  const paid = valid.filter(a => a.is_paid);
  const unpaid = valid.filter(a => !a.is_paid);

  const totPaid = paid.reduce((s, a) => s + amt(a), 0);
  const totUnpaid = unpaid.reduce((s, a) => s + amt(a), 0);
  const doneCount = appts.filter(a => a.status === "done").length;

  const byMethod = new Map<string, number>();
  for (const a of paid) {
    const k = a.payment_method || "altro";
    byMethod.set(k, (byMethod.get(k) ?? 0) + amt(a));
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 260, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "85vh", background: "#fff", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 70px rgba(15,23,42,0.35)" }}>

        <div style={{ padding: "16px 20px", background: "linear-gradient(135deg,#0d9488,#1d4ed8)", color: "#fff" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>💶 Chiusura cassa</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
            {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} · {doneCount} sedute fatte
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 10, letterSpacing: -0.5 }}>{money(totPaid)}</div>
          <div style={{ fontSize: 11.5, opacity: 0.8 }}>incassati oggi{totUnpaid > 0 ? ` · ${money(totUnpaid)} ancora da riscuotere` : " · tutto riscosso ✓"}</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Per metodo */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, byMethod.size)}, 1fr)`, gap: 8 }}>
            {byMethod.size === 0 ? (
              <div style={{ fontSize: 12, color: "#7c8aa0", textAlign: "center", padding: "8px 0" }}>Nessun incasso registrato oggi.</div>
            ) : Array.from(byMethod.entries()).map(([m, v]) => (
              <div key={m} style={{ border: `1px solid ${THEME.border}`, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>{METHOD_LABEL[m] ?? "❓ Altro"}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", marginTop: 3 }}>{money(v)}</div>
              </div>
            ))}
          </div>

          {/* Non pagati */}
          {unpaid.length > 0 && (
            <div style={{ border: "1.5px solid rgba(220,38,38,0.25)", background: "rgba(220,38,38,0.03)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "9px 13px", fontSize: 12, fontWeight: 700, color: "#b91c1c", borderBottom: `1px solid ${THEME.border}` }}>
                Da riscuotere ({unpaid.length})
              </div>
              {unpaid.map((a, i) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 13px", borderBottom: i < unpaid.length - 1 ? `1px solid ${THEME.border}` : "none", background: "#fff" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1e293b" }}>{nameOf(a)}</div>
                    <div style={{ fontSize: 10.5, color: "#94a3b8" }}>{fmtTime(a.start_at)} · {money(amt(a))}</div>
                  </div>
                  <PaidPill
                    data={{ is_paid: !!a.is_paid, paid_at: a.paid_at ?? null, payment_method: a.payment_method ?? null, price_type: a.price_type ?? null }}
                    onUpdate={async (next) => onUpdatePayment(a.id, next)}
                  />
                </div>
              ))}
            </div>
          )}

          {unpaid.length === 0 && totPaid > 0 && (
            <div style={{ textAlign: "center", fontSize: 12.5, color: THEME.green, fontWeight: 700, padding: "4px 0" }}>
              ✓ Cassa quadrata: tutto riscosso. Buona serata! 🌙
            </div>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: `1px solid ${THEME.border}`, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#0d9488,#2563eb)", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
