"use client";

// ═══════════════════════════════════════════════════════════════════════════
// STATUS SHEET — cambio stato seduta (Restyling Direzione A, R2)
//
// Bottom sheet aperto dal tap sulla pill di stato in agenda. Tutti gli
// stati raggiungibili in due tap, senza cicli ciechi:
//   • Pagato          → richiede il metodo (contanti / POS / bonifico);
//                       il metodo alimenta i report incassi.
//   • Da saldare      → seduta eseguita, incasso in sospeso
//   • Non pagato      → chiusa senza incasso (esce dai "da saldare")
//   • Riporta a Confermato → azzera pagamento e stato
//
// Componente presentazionale e riusabile: la scrittura su DB la fa il
// chiamante via onAction. Lo riuseranno home (R2) e calendario (R4).
// ═══════════════════════════════════════════════════════════════════════════

import React from "react";
import { MOBILE_THEME as T } from "@/src/theme/tokens";
import { Icon } from "@/src/components/icons";
import type { PaymentMethod } from "@/src/components/PaidPopover";

export type StatusSheetAction =
  | { kind: "paid"; method: PaymentMethod }
  | { kind: "settle" }
  | { kind: "not_paid" }
  | { kind: "confirmed" };

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash",          label: "Contanti" },
  { value: "pos",           label: "POS / Carta" },
  { value: "bank_transfer", label: "Bonifico" },
];

export default function StatusSheet({
  open,
  patientName,
  time,
  treatment,
  amount,
  currentMethod,
  isPaid,
  busy,
  onAction,
  onClose,
}: {
  open: boolean;
  patientName: string;
  time: string;
  treatment: string | null;
  amount: number | null;
  currentMethod: PaymentMethod | null;
  isPaid: boolean;
  busy: boolean;
  onAction: (a: StatusSheetAction) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const optStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 11, width: "100%",
    padding: "12px 13px", border: `1px solid ${T.border}`, borderRadius: 12,
    marginBottom: 8, background: T.panelBg, cursor: "pointer", textAlign: "left",
    opacity: busy ? 0.6 : 1,
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(26,29,36,0.34)" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0,
          background: T.panelBg, borderRadius: "22px 22px 0 0",
          padding: "13px 16px calc(env(safe-area-inset-bottom,0px) + 18px)",
          boxShadow: "0 -8px 30px rgba(26,29,36,0.14)",
          animation: "sheetUp 0.18s ease",
        }}
      >
        <style>{`@keyframes sheetUp { from { transform: translateY(24px); opacity: 0.6; } to { transform: translateY(0); opacity: 1; } }`}</style>

        <div style={{ width: 36, height: 4, borderRadius: 99, background: T.border, margin: "0 auto 12px" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.ink }}>Stato seduta</p>
            <p style={{ margin: "1px 0 0", fontSize: 12, color: T.warm500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {patientName} · {time}{treatment ? ` · ${treatment}` : ""}
            </p>
          </div>
          {typeof amount === "number" && amount > 0 && (
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: T.ink, flexShrink: 0 }}>€ {amount}</p>
          )}
        </div>

        {/* Pagato + metodo */}
        <div style={{ ...optStyle, cursor: "default", border: `1.5px solid ${T.teal}`, background: T.tealTint }}>
          <Icon name="check" size={17} color={T.tealDeep} strokeWidth={2.2} />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.tealDeep }}>Pagato</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
              {METHODS.map(m => {
                const active = isPaid && currentMethod === m.value;
                return (
                  <button
                    key={m.value}
                    disabled={busy}
                    onClick={() => onAction({ kind: "paid", method: m.value })}
                    style={{
                      textAlign: "center", fontSize: 11, fontWeight: active ? 700 : 600,
                      color: active ? T.tealDeep : T.muted,
                      background: "#fff",
                      border: `${active ? 1.5 : 1}px solid ${active ? T.teal : T.border}`,
                      borderRadius: 9, padding: "8px 4px", cursor: "pointer",
                    }}
                  >{m.label}</button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Da saldare */}
        <button disabled={busy} onClick={() => onAction({ kind: "settle" })} style={optStyle}>
          <Icon name="clock" size={17} color={T.amber} />
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink }}>Da saldare</span>
            <span style={{ display: "block", fontSize: 11, color: T.warm500, marginTop: 1 }}>Seduta fatta, incasso in sospeso</span>
          </span>
        </button>

        {/* Non pagato */}
        <button disabled={busy} onClick={() => onAction({ kind: "not_paid" })} style={optStyle}>
          <Icon name="x" size={17} color={T.red} />
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink }}>Non pagato</span>
            <span style={{ display: "block", fontSize: 11, color: T.warm500, marginTop: 1 }}>Chiusa senza incasso · esce dai «da saldare»</span>
          </span>
        </button>

        {/* Riporta a Confermato */}
        <button disabled={busy} onClick={() => onAction({ kind: "confirmed" })} style={{ ...optStyle, marginBottom: 0 }}>
          <Icon name="undo" size={17} color={T.blue} />
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink }}>Riporta a Confermato</span>
            <span style={{ display: "block", fontSize: 11, color: T.warm500, marginTop: 1 }}>Annulla pagamento e stato</span>
          </span>
        </button>
      </div>
    </div>
  );
}
