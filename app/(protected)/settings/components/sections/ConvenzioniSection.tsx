// app/(protected)/settings/components/sections/ConvenzioniSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Convenzioni" — accende o spegne il modulo per fondi sanitari,
// casse e assicurazioni (studios.convenzioni_enabled, mig. 065).
//
// Spento di default: chi lavora solo in privato non deve vedere campi che
// non gli servono. Acceso, compaiono la voce "Convenzioni" nel menu utente
// e il campo convenzione nella creazione dell'appuntamento.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import Link from "next/link";
import { THEME, cardStyle, sectionHead } from "../shared/theme";

export type ConvenzioniSectionProps = {
  show: boolean;
  onToggle: () => void;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  saving: boolean;
  onSave: () => void;
};

export default function ConvenzioniSection({
  show, onToggle, enabled, setEnabled, saving, onSave,
}: ConvenzioniSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>
            Convenzioni
          </div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            Fondi sanitari, casse e assicurazioni: enti, listini e sedute da fatturare
          </div>
        </div>
        <span style={{
          color: THEME.muted, fontSize: 12,
          transform: show ? "rotate(180deg)" : "none", transition: "transform 0.2s",
        }}>▾</span>
      </div>

      {show && (
        <div style={{ padding: 20 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 16, padding: "14px 16px", borderRadius: 9,
            background: enabled ? "rgba(13,148,136,0.07)" : THEME.panelSoft,
            border: `1px solid ${enabled ? "rgba(13,148,136,0.25)" : THEME.border}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text }}>
                {enabled ? "Modulo attivo" : "Modulo spento"}
              </div>
              <div style={{ fontSize: 12.5, color: THEME.muted, marginTop: 3, lineHeight: 1.55 }}>
                {enabled
                  ? "Trovi «Convenzioni» nel menu in alto a destra, e nella creazione dell'appuntamento puoi indicare l'ente con il numero di autorizzazione."
                  : "Accendilo solo se lavori con fondi o assicurazioni: da spento non compare nessun campo in più da nessuna parte."}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              aria-label="Attiva o disattiva il modulo convenzioni"
              style={{
                width: 48, height: 27, borderRadius: 999, flexShrink: 0,
                border: "none", cursor: "pointer", position: "relative",
                background: enabled ? THEME.teal : "#cbd5e1", transition: "background 0.2s",
              }}
            >
              <span style={{
                position: "absolute", top: 3, left: enabled ? 24 : 3,
                width: 21, height: 21, borderRadius: "50%", background: "#fff",
                transition: "left 0.2s", boxShadow: "0 1px 3px rgba(15,23,42,0.25)",
              }} />
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              style={{
                padding: "10px 18px", borderRadius: 9, border: "none",
                background: saving ? "#cbd5e1" : THEME.teal, color: "#fff",
                fontWeight: 700, fontSize: 13.5, cursor: saving ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >{saving ? "Salvo…" : "Salva"}</button>

            {enabled && (
              <Link href="/convenzioni" style={{
                padding: "10px 18px", borderRadius: 9,
                border: `1px solid ${THEME.border}`, background: "#fff",
                color: THEME.text, fontWeight: 700, fontSize: 13.5, textDecoration: "none",
              }}>Apri Convenzioni →</Link>
            )}
          </div>

          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 14, lineHeight: 1.6 }}>
            Dentro trovi un registro con i principali fondi, casse e reti italiane già pronti, il link
            per chiedere il convenzionamento e l&apos;import del listino dalla foto o dal PDF del
            nomenclatore.
          </div>
        </div>
      )}
    </div>
  );
}
