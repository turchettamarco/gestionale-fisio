// ═══════════════════════════════════════════════════════════════════════
// src/components/PaidPill.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Pillola larga "✓ Contanti · oggi" cliccabile per liste larghe (home,
// scheda paziente, mobile home). Click apre PaidPopover.
//
// Per le card strette del calendario usa invece PaidIconButton.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState, useRef, useCallback } from "react";
import { CircleDollarSign } from "lucide-react";
import PaidPopover, { type PaymentMethod } from "./PaidPopover";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Contanti",
  pos: "POS",
  bank_transfer: "Bonifico",
};

function formatPillDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return "oggi";
  if (diffDays === 1) return "ieri";
  const dd = String(target.getDate()).padStart(2, "0");
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  if (target.getFullYear() === today.getFullYear()) return `${dd}/${mm}`;
  const yy = String(target.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

type Props = {
  data: {
    is_paid: boolean;
    paid_at: Date | string | null;
    payment_method: PaymentMethod | null;
    price_type: string | null;
  };
  onUpdate: (next: {
    is_paid: boolean;
    paid_at: string | null;
    payment_method: PaymentMethod | null;
  }) => Promise<void> | void;
  compact?: boolean;
  disabled?: boolean;
};

export default function PaidPill({
  data,
  onUpdate,
  compact = false,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const isFatturato = data.price_type === "invoiced";

  const handleClick = useCallback(async () => {
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
  }, [disabled, busy, data.is_paid, isFatturato, onUpdate]);

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

  const renderLabel = () => {
    if (!data.is_paid) return "Da pagare";
    const method = data.payment_method ?? "cash";
    const methodLbl = METHOD_LABEL[method];
    if (compact) return methodLbl;
    return `${methodLbl} · ${formatPillDate(data.paid_at)}`;
  };

  const pillStyle: React.CSSProperties = data.is_paid
    ? {
        color: "#15803d",
        background: "#dcfce7",
        border: open ? "1.5px solid #16a34a" : "1px solid #86efac",
      }
    : {
        color: "#c2410c",
        background: "#ffedd5",
        border: "1px solid #fdba74",
      };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12,
          padding: compact ? "3px 8px" : "4px 10px",
          borderRadius: 999,
          fontWeight: 500,
          cursor: disabled || busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
          whiteSpace: "nowrap",
          ...pillStyle,
        }}
      >
        <CircleDollarSign
          size={13}
          color={data.is_paid ? "#15803d" : "#c2410c"}
          strokeWidth={2.2}
        />
        {data.is_paid && (
          <span style={{ fontSize: 10, fontWeight: 800, marginRight: 1 }}>✓</span>
        )}
        {renderLabel()}
      </button>

      {open && anchor && (
        <PaidPopover
          anchor={{
            top: anchor.top,
            right: anchor.right,
            bottom: anchor.bottom,
            left: anchor.left,
          }}
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
