// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/clinical/PainLocationsModal.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Modale per selezionare le sedi del dolore di un paziente.
// Apre dal click sulla riga "Sede del dolore" nella checklist anamnesi.
//
// COMPORTAMENTO:
//   - Lista 8 distretti anatomici dalla costante PAIN_DISTRICTS
//   - Per ogni distretto: lista zone (con suffisso sx/dx/bilat se bilaterali)
//   - Click su una zona la aggiunge/rimuove dalla selezione
//   - Conteggio totale "X zone selezionate" in alto
//   - Chip neutri (grigio scuro selezionato)
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import React, { useEffect } from "react";
import { PAIN_DISTRICTS } from "@/src/lib/clinical/painLocations";

const T = {
  bg:           "#ffffff",
  bgSoft:       "#fafbfc",
  text:         "#0f172a",
  textSoft:     "#1e293b",
  label:        "#475569",
  muted:        "#64748b",
  mutedSoft:    "#94a3b8",
  border:       "#e2e8f0",
  borderSoft:   "#f1f5f9",
  chipOn:       "#1e293b",
  accent:       "#0d9488",
};

export type PainLocationsModalProps = {
  open: boolean;
  selected: string[];
  onChange: (selected: string[]) => void;
  onClose: () => void;
};

export default function PainLocationsModal({
  open, selected, onChange, onClose,
}: PainLocationsModalProps) {

  // Chiudi con Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function toggle(code: string) {
    if (selected.includes(code)) onChange(selected.filter(c => c !== code));
    else onChange([...selected, code]);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.bg,
          borderRadius: 14,
          width: "100%", maxWidth: 680, maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
              Sede del dolore
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
              {selected.length === 0
                ? "Nessuna zona selezionata"
                : `${selected.length} zon${selected.length === 1 ? "a selezionata" : "e selezionate"}`}
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
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px 16px" }}>

          {PAIN_DISTRICTS.map(district => {
            const districtCodes = district.zones.flatMap(z =>
              z.bilateral
                ? [`${z.code}_left`, `${z.code}_right`, `${z.code}_bilateral`]
                : [z.code]
            );
            const districtSelectedCount = districtCodes.filter(c => selected.includes(c)).length;

            return (
              <div key={district.id} style={{ marginTop: 14 }}>
                <div style={{
                  fontSize: 10, fontWeight: 800, color: T.muted,
                  textTransform: "uppercase", letterSpacing: 0.8,
                  padding: "0 0 6px",
                  borderBottom: `1px solid ${T.borderSoft}`,
                  marginBottom: 8,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span>{district.label}</span>
                  {districtSelectedCount > 0 && (
                    <span style={{ color: T.chipOn, fontWeight: 800 }}>
                      {districtSelectedCount} ●
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {district.zones.map(zone => {
                    if (!zone.bilateral) {
                      const isOn = selected.includes(zone.code);
                      return (
                        <button key={zone.code} onClick={() => toggle(zone.code)}
                          style={chipStyle(isOn)}>{zone.label}</button>
                      );
                    }
                    // Zona bilaterale: composta con 3 mini-pulsanti sx/dx/bil
                    return (
                      <div key={zone.code} style={{
                        display: "inline-flex", border: `1px solid ${T.border}`,
                        borderRadius: 99, overflow: "hidden",
                      }}>
                        <span style={{
                          padding: "5px 10px", background: T.bgSoft,
                          fontSize: 12, fontWeight: 700, color: T.muted,
                        }}>{zone.label}</span>
                        {(["left", "right", "bilateral"] as const).map(side => {
                          const code = `${zone.code}_${side}`;
                          const isOn = selected.includes(code);
                          return (
                            <button key={side} onClick={() => toggle(code)}
                              style={{
                                padding: "5px 9px", border: "none",
                                background: isOn ? T.chipOn : T.bg,
                                color: isOn ? "#fff" : T.muted,
                                fontWeight: 700, fontSize: 11, cursor: "pointer",
                                fontFamily: "inherit",
                                borderLeft: `1px solid ${T.border}`,
                              }}>
                              {side === "left" ? "sx" : side === "right" ? "dx" : "bil"}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: `1px solid ${T.border}`,
          background: T.bgSoft,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
            Click sulle zone per selezionare/deselezionare
          </span>
          <button onClick={onClose}
            style={{
              padding: "8px 16px", borderRadius: 7, border: "none",
              background: T.accent, color: "#fff", fontWeight: 700, fontSize: 13,
              cursor: "pointer", fontFamily: "inherit",
            }}>Fatto</button>
        </div>
      </div>
    </div>
  );
}

function chipStyle(on: boolean): React.CSSProperties {
  return {
    padding: "5px 11px", borderRadius: 99,
    border: `1px solid ${on ? T.chipOn : T.border}`,
    background: on ? T.chipOn : T.bg,
    color: on ? "#fff" : T.label,
    fontWeight: on ? 700 : 600, fontSize: 12,
    cursor: "pointer", fontFamily: "inherit",
    transition: "all 0.12s",
  };
}
