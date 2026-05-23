// ═══════════════════════════════════════════════════════════════════════
// src/components/mobile/ToastProvider.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Sistema di toast in-app per il mobile. Sostituisce `alert()` nativo che:
//   • Su iOS PWA è esteticamente fuori contesto
//   • È bloccante (l'utente deve cliccare OK)
//   • Non si integra col design del gestionale
//
// Espone DUE API:
//
//   1. Hook React (uso dentro componenti):
//        const toast = useToast();
//        toast.error("Errore aggiornamento gruppo");
//        toast.success("Pagamento registrato");
//
//   2. API globale imperativa (uso da moduli non-React come groupHandlers.ts):
//        import { showToast } from "@/src/components/mobile/ToastProvider";
//        showToast.error("Sessione scaduta");
//
// I toast appaiono in basso (sopra la bottom nav), si auto-chiudono dopo
// 3.5s e supportano stack (più toast contemporanei).
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

// ── Tipi ─────────────────────────────────────────────────────────────────

export type ToastKind = "error" | "success" | "info" | "warning";

export type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastContextValue = {
  push: (kind: ToastKind, message: string) => void;
  error: (message: string) => void;
  success: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
};

// ── Context ──────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ── API globale imperativa ───────────────────────────────────────────────
// Permette di chiamare `showToast.error(...)` anche da fuori React.
// Il provider la collega al suo stato in fase di mount.

let pushFn: ((kind: ToastKind, message: string) => void) | null = null;

export const showToast = {
  error: (m: string) => pushFn?.("error", m),
  success: (m: string) => pushFn?.("success", m),
  info: (m: string) => pushFn?.("info", m),
  warning: (m: string) => pushFn?.("warning", m),
};

// ── Provider ─────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems((prev) => [...prev, { id, kind, message }]);
    // Auto-dismiss
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  // Collega push alla API globale (per moduli non-React)
  useEffect(() => {
    pushFn = push;
    return () => {
      pushFn = null;
    };
  }, [push]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const ctxValue: ToastContextValue = {
    push,
    error: (m) => push("error", m),
    success: (m) => push("success", m),
    info: (m) => push("info", m),
    warning: (m) => push("warning", m),
  };

  return (
    <ToastContext.Provider value={ctxValue}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback no-op se il provider non è montato (evita crash)
    return {
      push: () => {},
      error: () => {},
      success: () => {},
      info: () => {},
      warning: () => {},
    };
  }
  return ctx;
}

// ── Viewport (renderizza i toast) ────────────────────────────────────────

const STYLE_BY_KIND: Record<
  ToastKind,
  { bg: string; border: string; text: string; icon: string }
> = {
  error: {
    bg: "#fef2f2",
    border: "#fecaca",
    text: "#991b1b",
    icon: "⚠️",
  },
  success: {
    bg: "#f0fdf4",
    border: "#bbf7d0",
    text: "#166534",
    icon: "✅",
  },
  info: {
    bg: "#eff6ff",
    border: "#bfdbfe",
    text: "#1e40af",
    icon: "ℹ️",
  },
  warning: {
    bg: "#fffbeb",
    border: "#fde68a",
    text: "#92400e",
    icon: "⚠️",
  },
};

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        // Posizionato sopra la bottom nav (~70px alta) con safe-area iOS
        bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
        left: 14,
        right: 14,
        zIndex: 200000,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
      role="region"
      aria-label="Notifiche"
      aria-live="polite"
    >
      {items.map((t) => {
        const s = STYLE_BY_KIND[t.kind];
        return (
          <div
            key={t.id}
            onClick={() => onDismiss(t.id)}
            style={{
              pointerEvents: "auto",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 12,
              background: s.bg,
              border: `1.5px solid ${s.border}`,
              color: s.text,
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.4,
              boxShadow:
                "0 8px 24px rgba(15,23,42,0.12), 0 2px 6px rgba(15,23,42,0.06)",
              cursor: "pointer",
              fontFamily: "Inter, -apple-system, sans-serif",
              animation: "fh-toast-in 0.25s ease-out",
            }}
            role={t.kind === "error" ? "alert" : "status"}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{s.icon}</span>
            <span style={{ flex: 1, wordBreak: "break-word" }}>{t.message}</span>
            <span style={{ opacity: 0.55, fontSize: 16, flexShrink: 0 }}>×</span>
          </div>
        );
      })}
      <style>{`
        @keyframes fh-toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
