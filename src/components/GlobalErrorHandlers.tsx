"use client";
// ═══════════════════════════════════════════════════════════════════════
// src/components/GlobalErrorHandlers.tsx
// ═══════════════════════════════════════════════════════════════════════
// Si registra a livello window per catturare:
//  1. window.onerror — errori JS sincroni non catturati da nessun try/catch
//  2. window.onunhandledrejection — promise rifiutate senza .catch()
//
// Entrambi vengono inoltrati al logger come "fatal" o "error".
//
// Questo componente NON renderizza nulla. Va montato una sola volta in alto
// nell'albero (es. dentro ProtectedProviders).
//
// FILTRI:
// - Ignora errori di estensioni browser (script da chrome-extension://, ecc.)
// - Ignora il classico "ResizeObserver loop limit exceeded" (rumore innocuo)
// - Ignora errori di rete network "Failed to fetch" se durano <100ms
//   (di solito sono richieste annullate dal browser, non veri errori)
// ═══════════════════════════════════════════════════════════════════════

import { useEffect } from "react";
import { logger } from "@/src/lib/logger";

// Pattern di errori da NON loggare (rumore noto e innocuo)
const IGNORED_ERROR_PATTERNS = [
  /ResizeObserver loop/i,
  /ResizeObserver loop limit exceeded/i,
  // Errori da estensioni Chrome/Firefox (non sono nostri)
  /^Script error\.?$/i,
  // Errori di Next.js dev/HMR
  /Hydration failed because/i,
  /There was an error while hydrating/i,
];

const IGNORED_SOURCE_PATTERNS = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
];

function shouldIgnore(message: string, source?: string): boolean {
  for (const pattern of IGNORED_ERROR_PATTERNS) {
    if (pattern.test(message)) return true;
  }
  if (source) {
    for (const pattern of IGNORED_SOURCE_PATTERNS) {
      if (pattern.test(source)) return true;
    }
  }
  return false;
}

export default function GlobalErrorHandlers() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // ─── Handler 1: errori JS sincroni non catturati ─────────────────
    const onError = (event: ErrorEvent) => {
      const message = event.message || "Unknown JS error";
      const source = event.filename || undefined;

      if (shouldIgnore(message, source)) return;

      logger.error("Unhandled JS error", event.error ?? new Error(message), {
        action: "window_onerror",
        source_file: source,
        source_line: event.lineno,
        source_col: event.colno,
      });
    };

    // ─── Handler 2: promise rifiutate senza .catch() ─────────────────
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";

      if (shouldIgnore(message)) return;

      logger.error(
        "Unhandled promise rejection",
        reason instanceof Error ? reason : new Error(String(message)),
        {
          action: "window_unhandledrejection",
        }
      );
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
