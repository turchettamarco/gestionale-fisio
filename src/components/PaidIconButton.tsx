// ═══════════════════════════════════════════════════════════════════════
// src/components/PaidIconButton.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Micro-bottone "pagato" per le card del calendario (settimana / giorno).
// Sostituisce il vecchio bottone con emoji 🪙 con l'icona Lucide CircleEuro.
//
// Comportamento:
// - Click su NON pagato + price_type cash/null → segna pagato direttamente
//   (1 click, niente popover. Trigger DB popola payment_method=cash).
// - Click su NON pagato + price_type invoiced → apre popover (l'utente
//   sceglie il metodo).
// - Click su PAGATO → apre popover di modifica metodo + data, oppure
//   "segna non pagato".
//
// Variante visiva controllata da `tone`:
// - "light" → su sfondo scuro (card colorata): bordo bianco semitrasparente
// - "dark"  → su sfondo chiaro (sidebar): bordo verde
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState, useRef, useCallback } from "react";
import { CircleDollarSign } from "lucide-react";
import PaidPopover, { type PaymentMethod } from "./PaidPopover";

type Props = {
  data: {
    is_paid: boolean;
    paid_at: Date | string | null;
    payment_method: PaymentMethod | null;
    price_type: string | null;
  };
  /**
   * Callback chiamata per ogni cambio di stato del pagamento.
   * Riceve i nuovi valori che il chiamante deve scrivere in DB.
   * Se isPaid=false, gli altri campi sono null.
   */
  onUpdate: (next: {
    is_paid: boolean;
    paid_at: string | null;
    payment_method: PaymentMethod | null;
  }) => Promise<void> | void;
  /** Stile per sfondo scuro (card calendar) o chiaro (sidebar). Default "light". */
  tone?: "light" | "dark";
  /** Dimensione del bottone (px, default 18). */
  size?: number;
  disabled?: boolean;
};

export default function PaidIconButton({
  data,
  onUpdate,
  tone = "light",
  size = 18,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const isFatturato = data.price_type === "invoiced";

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled || busy) return;
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;

      if (!data.is_paid) {
        if (isFatturato) {
          setAnchor(rect);
          setOpen(true);
          return;
        }
        setBusy(true);
        try {
          await onUpdate({
            is_paid: true,
            paid_at: new Date().toISOString(),
            payment_method: "cash",
          });
        } finally {
          setBusy(false);
        }
        return;
      }

      setAnchor(rect);
      setOpen(true);
    },
    [disabled, busy, data.is_paid, isFatturato, onUpdate]
  );

  const handleSave = useCallback(
    async (next: { paid_at: string; payment_method: PaymentMethod }) => {
      await onUpdate({
        is_paid: true,
        paid_at: next.paid_at,
        payment_method: next.payment_method,
      });
      setOpen(false);
    },
    [onUpdate]
  );

  const handleUnpay = useCallback(async () => {
    await onUpdate({ is_paid: false, paid_at: null, payment_method: null });
    setOpen(false);
  }, [onUpdate]);

  const isPaid = data.is_paid;

  let bg: string, border: string, iconColor: string;
  if (tone === "light") {
    bg = isPaid ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)";
    border = isPaid ? "1px solid rgba(255,255,255,0.7)" : "1px solid rgba(255,255,255,0.3)";
    iconColor = isPaid ? "#fff" : "rgba(255,255,255,0.6)";
  } else {
    bg = isPaid ? "#dcfce7" : "rgba(13,148,136,0.08)";
    border = isPaid ? "1px solid #16a34a" : "1px solid rgba(13,148,136,0.3)";
    iconColor = isPaid ? "#15803d" : "rgba(13,148,136,0.6)";
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleClick}
        disabled={disabled || busy}
        title={
          isPaid
            ? "Pagato — clicca per modificare"
            : "Segna pagato"
        }
        style={{
          background: bg,
          border,
          borderRadius: 4,
          padding: "0 5px",
          height: size,
          minWidth: size + 8,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          cursor: disabled || busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
          lineHeight: 1,
        }}
      >
        <CircleDollarSign size={Math.max(11, size - 7)} color={iconColor} strokeWidth={2.2} />
        {isPaid && (
          <span
            style={{
              fontSize: Math.max(9, size - 9),
              fontWeight: 800,
              color: iconColor,
              lineHeight: 1,
            }}
          >
            ✓
          </span>
        )}
      </button>

      {open && anchor && (
        <PaidPopover
          anchor={{ top: anchor.top, right: anchor.right, bottom: anchor.bottom, left: anchor.left }}
          initial={{
            paid_at: data.paid_at,
            payment_method: data.payment_method,
            price_type: data.price_type,
          }}
          onSave={handleSave}
          onUnpay={handleUnpay}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
