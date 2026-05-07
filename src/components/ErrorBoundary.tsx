"use client";
// ═══════════════════════════════════════════════════════════════════════
// src/components/ErrorBoundary.tsx
// ═══════════════════════════════════════════════════════════════════════
// Cattura crash di componenti React e:
//  1. Logga l'errore in error_logs (via logger.fatal)
//  2. Mostra una UI di fallback amichevole all'utente
//  3. Permette di "ricaricare" l'area senza F5 totale
//
// Uso (di solito a livello molto alto, nel layout protetto):
//   <ErrorBoundary>
//     <App />
//   </ErrorBoundary>
//
// Uso più granulare (per isolare aree rischiose):
//   <ErrorBoundary fallback={<MioFallbackCustom />}>
//     <ComponenteSperimentale />
//   </ErrorBoundary>
// ═══════════════════════════════════════════════════════════════════════

import React from "react";
import { logger } from "@/src/lib/logger";

type Props = {
  children: React.ReactNode;
  /** UI custom da mostrare al posto del default. */
  fallback?: React.ReactNode;
  /** Etichetta per identificare quale boundary ha catturato (utile in liste). */
  label?: string;
};

type State = {
  hasError: boolean;
  errorMessage: string | null;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message ?? "Errore sconosciuto",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Logging strutturato. Il logger gestisce sanitizzazione, rate-limit, ecc.
    logger.fatal("React component crash", error, {
      action: "react_error_boundary",
      boundary_label: this.props.label ?? null,
      component_stack: (info.componentStack ?? "").slice(0, 2000),
    });
  }

  handleReset = (): void => {
    // Tentiamo di "rimontare" l'area. Se l'errore è transitorio (es. fetch
    // fallita una volta) questo lo risolve. Se è strutturale, ricomparirà.
    this.setState({ hasError: false, errorMessage: null });
  };

  handleReload = (): void => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    // Default fallback UI: blocco di errore amichevole, in linea col tema
    // FisioHub (gradient teal-to-blue, no glassmorphism).
    return (
      <div
        style={{
          minHeight: 280,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            background: "#ffffff",
            border: "1.5px solid #e2e8f0",
            borderRadius: 14,
            padding: 24,
            boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#0d9488,#2563eb)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 14px",
              fontSize: 28,
            }}
          >
            ⚠️
          </div>
          <h3
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "#0f172a",
              margin: "0 0 8px",
            }}
          >
            Qualcosa è andato storto
          </h3>
          <p
            style={{
              fontSize: 13,
              color: "#334155",
              margin: "0 0 16px",
              lineHeight: 1.5,
            }}
          >
            L&apos;errore è stato registrato. Puoi riprovare oppure ricaricare la pagina.
            Se il problema persiste, contatta il supporto.
          </p>
          {this.state.errorMessage && (
            <pre
              style={{
                background: "#f7f9fd",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 11,
                color: "#475569",
                textAlign: "left",
                margin: "0 0 16px",
                maxHeight: 100,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {this.state.errorMessage}
            </pre>
          )}
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={this.handleReset}
              style={{
                background: "#fff",
                color: "#334155",
                border: "1.5px solid #cbd5e1",
                borderRadius: 9,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Riprova
            </button>
            <button
              onClick={this.handleReload}
              style={{
                background: "linear-gradient(135deg,#0d9488,#2563eb)",
                color: "#fff",
                border: "none",
                borderRadius: 9,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(13,148,136,0.25)",
              }}
            >
              Ricarica pagina
            </button>
          </div>
        </div>
      </div>
    );
  }
}
