// app/(protected)/settings/components/sections/DurationsSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Durate Appuntamento" — minuti default per tipo trattamento.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, inputStyle } from "../shared/theme";
import { BtnPrimary } from "../shared/Buttons";

export type DurationsSectionProps = {
  show: boolean;
  onToggle: () => void;
  savingPractice: boolean;
  durSeduta: string; setDurSeduta: (v: string) => void;
  durMacchina: string; setDurMacchina: (v: string) => void;
  durLaser: string; setDurLaser: (v: string) => void;
  durTecar: string; setDurTecar: (v: string) => void;
  durOndeUrto: string; setDurOndeUrto: (v: string) => void;
  durTens: string; setDurTens: (v: string) => void;
  onSave: () => void;
};

export default function DurationsSection(p: DurationsSectionProps) {
  const cards = [
    { label: "Seduta",      v: p.durSeduta,    set: p.setDurSeduta,    color: "#0d9488" },
    { label: "Macchinario", v: p.durMacchina,  set: p.setDurMacchina,  color: "#2563eb" },
    { label: "Laser",       v: p.durLaser,     set: p.setDurLaser,     color: "#d97706" },
    { label: "Tecar",       v: p.durTecar,     set: p.setDurTecar,     color: "#ea580c" },
    { label: "Onde d'urto", v: p.durOndeUrto,  set: p.setDurOndeUrto,  color: "#7c3aed" },
    { label: "TENS",        v: p.durTens,      set: p.setDurTens,      color: "#059669" },
  ];

  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Durate Appuntamento</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>Durata predefinita per tipo trattamento (minuti)</div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>
      {p.show && (
        <div style={{ padding: "20px" }}>
          <div className="settings-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            {cards.map(d => (
              <div key={d.label} style={{ padding: "12px", borderRadius: 9, border: `2px solid ${d.color}22`, background: `${d.color}08` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: d.color, marginBottom: 8 }}>{d.label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="number" value={d.v} onChange={e => d.set(e.target.value)} min={5} max={240} step={5}
                    style={{ ...inputStyle, textAlign: "right", fontWeight: 700, fontSize: 15, padding: "7px 8px", width: "70px" }} />
                  <span style={{ fontSize: 12, color: THEME.muted }}>min</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <BtnPrimary label={p.savingPractice ? "Salvataggio…" : "Salva durate"} onClick={p.onSave} disabled={p.savingPractice} />
          </div>
        </div>
      )}
    </div>
  );
}
