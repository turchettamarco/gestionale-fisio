// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/clinical/AISuggestionModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Modale generica per mostrare un suggerimento AI e chiedere approvazione
// prima di applicarlo al DB. Usata da:
//   - Suggerimento Diagnosi
//   - Suggerimento Piano
//   - Generazione SOAP
//
// PROPS:
//   - open: visibilità
//   - title: titolo (es. "💡 Diagnosi suggerita")
//   - loading: true mentre l'AI elabora
//   - error: stringa di errore (se presente)
//   - children: contenuto custom del suggerimento (editabile prima di applicare)
//   - onClose: chiudi
//   - onApply: applica al DB (deve essere chiamato solo se l'utente approva)
//   - applyLabel: etichetta del bottone di applicazione (default "Applica")
// ═══════════════════════════════════════════════════════════════════════

"use client";

import React, { useEffect } from "react";

const T = {
  panelBg:    "#ffffff",
  panelSoft:  "#f8fafc",
  text:       "#0f172a",
  muted:      "#475569",
  mutedSoft:  "#94a3b8",
  border:     "#e2e8f0",
  borderSoft: "#f1f5f9",
  teal:       "#0d9488",
  blue:       "#2563eb",
  amber:      "#f59e0b",
  red:        "#dc2626",
  purple:     "#7c3aed",
};

export type AISuggestionModalProps = {
  open: boolean;
  title: string;
  loading?: boolean;
  error?: string | null;
  children?: React.ReactNode;
  onClose: () => void;
  onApply?: () => void;
  applyLabel?: string;
  /** Disabilita il bottone Applica (es. se l'output non è valido). */
  applyDisabled?: boolean;
};

export default function AISuggestionModal({
  open, title, loading, error, children, onClose, onApply, applyLabel = "Applica al paziente", applyDisabled,
}: AISuggestionModalProps) {

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 250,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.panelBg, borderRadius: 14,
          width: "100%", maxWidth: 640, maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >

        {/* Header */}
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(135deg, rgba(124,58,237,0.05), rgba(37,99,235,0.05))",
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, display: "flex", alignItems: "center", gap: 8 }}>
              {title}
              <span style={{
                padding: "2px 8px", borderRadius: 99,
                background: "linear-gradient(135deg, #7c3aed, #2563eb)",
                color: "#fff", fontSize: 9, fontWeight: 800,
                textTransform: "uppercase", letterSpacing: 0.5,
              }}>✨ AI</span>
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
              Revisiona il suggerimento, modifica se serve, poi applica
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 22, color: T.muted, lineHeight: 1, padding: 6,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} />
          ) : (
            children
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div style={{
            padding: "12px 20px", borderTop: `1px solid ${T.border}`,
            background: T.panelSoft,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 10,
          }}>
            <div style={{ fontSize: 10, color: T.mutedSoft, fontWeight: 600, fontStyle: "italic" }}>
              💡 I suggerimenti AI sono spunti, non diagnosi definitive
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={onClose}
                style={{
                  padding: "7px 14px", borderRadius: 7,
                  border: `1px solid ${T.border}`, background: T.panelBg,
                  color: T.muted, fontWeight: 600, fontSize: 12,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >Annulla</button>
              {onApply && (
                <button
                  onClick={onApply}
                  disabled={applyDisabled || !!error}
                  style={{
                    padding: "7px 16px", borderRadius: 7, border: "none",
                    background: applyDisabled || error
                      ? T.borderSoft
                      : "linear-gradient(135deg, #0d9488, #2563eb)",
                    color: applyDisabled || error ? T.muted : "#fff",
                    fontWeight: 800, fontSize: 12,
                    cursor: applyDisabled || error ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >{applyLabel}</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stati ────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <div style={{
        display: "inline-block",
        width: 40, height: 40,
        border: `4px solid ${T.borderSoft}`,
        borderTopColor: T.purple,
        borderRadius: "50%",
        animation: "ai-spin 0.8s linear infinite",
      }} />
      <div style={{ marginTop: 16, fontSize: 13, fontWeight: 700, color: T.muted }}>
        L'AI sta analizzando il paziente…
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: T.mutedSoft }}>
        Tempo medio: 3-8 secondi
      </div>
      <style>{`
        @keyframes ai-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{
      padding: 16, borderRadius: 8,
      background: "rgba(220,38,38,0.05)",
      border: `1px solid rgba(220,38,38,0.2)`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: T.red, marginBottom: 6 }}>
        ⚠ Errore AI
      </div>
      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>
        {message}
      </div>
    </div>
  );
}
