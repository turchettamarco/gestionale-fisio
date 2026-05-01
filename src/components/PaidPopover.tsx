// ═══════════════════════════════════════════════════════════════════════
// src/components/PaidPopover.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Popover di modifica pagamento, condiviso da PaidPill (liste larghe)
// e PaidIconButton (micro-bottoni calendar).
//
// Si apre quando l'utente clicca sulla pillola/icona di un appuntamento
// già pagato, oppure quando clicca su un appuntamento fatturato non
// ancora pagato.
//
// Per appuntamenti `cash`: mostra solo data + bottone unpay (metodo
// bloccato a "Contanti", invariante "non fatturato = sempre contante").
// Per appuntamenti `invoiced`: 3 toggle metodo + data + bottone unpay.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

export type PaymentMethod = "cash" | "pos" | "bank_transfer";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Contanti",
  pos: "POS",
  bank_transfer: "Bonifico",
};

function toDateInputValue(d: Date | string | null): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  const date = d instanceof Date ? d : new Date(d);
  const tzOff = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOff).toISOString().slice(0, 10);
}

type Props = {
  /** Coordinate ancoraggio (pixel viewport, di solito rect.bottom/right del trigger). */
  anchor: { top: number; right: number; bottom: number; left: number };
  /** Stato corrente del pagamento. */
  initial: {
    paid_at: Date | string | null;
    payment_method: PaymentMethod | null;
    price_type: string | null;
  };
  onSave: (next: {
    paid_at: string;
    payment_method: PaymentMethod;
  }) => Promise<void> | void;
  onUnpay: () => Promise<void> | void;
  onClose: () => void;
};

export default function PaidPopover({
  anchor,
  initial,
  onSave,
  onUnpay,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [editDate, setEditDate] = useState(toDateInputValue(initial.paid_at));
  const [editMethod, setEditMethod] = useState<PaymentMethod>(
    initial.payment_method ?? "cash"
  );
  const ref = useRef<HTMLDivElement>(null);

  const isFatturato = initial.price_type === "invoiced";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [onClose]);

  const POPOVER_WIDTH = 280;
  const POPOVER_HEIGHT_ESTIMATE = isFatturato ? 280 : 220;

  let left = anchor.right - POPOVER_WIDTH;
  if (left < 8) left = 8;
  if (left + POPOVER_WIDTH > window.innerWidth - 8)
    left = window.innerWidth - POPOVER_WIDTH - 8;
  let top = anchor.bottom + 6;
  if (top + POPOVER_HEIGHT_ESTIMATE > window.innerHeight - 8) {
    top = anchor.top - POPOVER_HEIGHT_ESTIMATE - 6;
    if (top < 8) top = 8;
  }

  const handleSave = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const [y, m, d] = editDate.split("-").map(Number);
      if (!y || !m || !d) {
        setBusy(false);
        return;
      }
      const paidDate = new Date();
      paidDate.setFullYear(y, m - 1, d);
      await onSave({
        paid_at: paidDate.toISOString(),
        payment_method: isFatturato ? editMethod : "cash",
      });
    } finally {
      setBusy(false);
    }
  }, [busy, editDate, editMethod, isFatturato, onSave]);

  const handleUnpay = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onUnpay();
    } finally {
      setBusy(false);
    }
  }, [busy, onUnpay]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        top,
        left,
        width: POPOVER_WIDTH,
        background: "#fff",
        border: "1px solid #d1d5db",
        borderRadius: 10,
        padding: 14,
        boxShadow:
          "0 10px 25px -5px rgba(0,0,0,0.15), 0 4px 10px -4px rgba(0,0,0,0.1)",
        zIndex: 10000,
        fontSize: 13,
        color: "#374151",
      }}
      onClick={e => e.stopPropagation()}
    >
      <div
        style={{
          fontSize: 11,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.4px",
          marginBottom: 10,
          fontWeight: 500,
        }}
      >
        Dettagli pagamento
      </div>

      {isFatturato ? (
        <>
          <label
            style={{
              fontSize: 11,
              color: "#6b7280",
              display: "block",
              marginBottom: 4,
            }}
          >
            Metodo
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 6,
              marginBottom: 12,
            }}
          >
            {(["cash", "pos", "bank_transfer"] as PaymentMethod[]).map(m => {
              const active = editMethod === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setEditMethod(m)}
                  style={{
                    fontSize: 12,
                    padding: "8px 4px",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: active ? "#dcfce7" : "#fff",
                    color: active ? "#15803d" : "#374151",
                    border: active
                      ? "1px solid #16a34a"
                      : "1px solid #d1d5db",
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  {METHOD_LABEL[m]}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 0",
              borderBottom: "1px solid #f3f4f6",
              fontSize: 13,
            }}
          >
            <span style={{ color: "#6b7280" }}>Metodo</span>
            <span style={{ fontWeight: 500 }}>Contanti</span>
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#9ca3af",
              marginTop: 4,
              fontStyle: "italic",
            }}
          >
            Non fatturato → sempre contante
          </div>
        </div>
      )}

      <label
        style={{
          fontSize: 11,
          color: "#6b7280",
          display: "block",
          marginBottom: 4,
        }}
      >
        Data pagamento
      </label>
      <input
        type="date"
        value={editDate}
        onChange={e => setEditDate(e.target.value)}
        style={{
          width: "100%",
          padding: "6px 8px",
          fontSize: 13,
          border: "1px solid #d1d5db",
          borderRadius: 6,
          marginBottom: 12,
          fontFamily: "inherit",
        }}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          style={{
            flex: 1,
            padding: "8px",
            fontSize: 13,
            border: "1px solid #d1d5db",
            borderRadius: 6,
            background: "#fff",
            cursor: "pointer",
            color: "#374151",
          }}
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          style={{
            flex: 1,
            padding: "8px",
            fontSize: 13,
            border: "1px solid #15803d",
            borderRadius: 6,
            background: "#16a34a",
            color: "#fff",
            cursor: busy ? "default" : "pointer",
            fontWeight: 500,
          }}
        >
          {busy ? "Salvo…" : "Salva"}
        </button>
      </div>

      <button
        type="button"
        onClick={handleUnpay}
        disabled={busy}
        style={{
          width: "100%",
          fontSize: 12,
          color: "#c2410c",
          background: "transparent",
          border: "none",
          padding: "6px 0",
          cursor: busy ? "default" : "pointer",
          textAlign: "center",
        }}
      >
        Segna come non pagato
      </button>
    </div>,
    document.body
  );
}
