// app/(protected)/settings/components/sections/CalendarPrefsSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Preferenze Calendario" — stato default appuntamenti +
// gestione sovrapposizione.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, labelStyle } from "../shared/theme";
import { BtnPrimary } from "../shared/Buttons";

export type CalendarPrefsSectionProps = {
  savingPractice: boolean;
  defaultApptStatus: "confirmed" | "booked";
  setDefaultApptStatus: (v: "confirmed" | "booked") => void;
  overlapMode: "block" | "warn" | "visual";
  setOverlapMode: (v: "block" | "warn" | "visual") => void;
  onSave: () => void;
};

export default function CalendarPrefsSection(p: CalendarPrefsSectionProps) {
  const statusOptions = [
    { k: "confirmed" as const, label: "✓ Confermato", desc: "Il paziente è già d'accordo sull'orario", color: THEME.blue, bg: "rgba(37,99,235,0.08)" },
    { k: "booked"    as const, label: "📅 Prenotato", desc: "Attende conferma del paziente",          color: THEME.teal, bg: "rgba(13,148,136,0.08)" },
  ];

  const overlapOptions = [
    { k: "block"  as const, icon: "⛔", label: "Blocco duro",       desc: "Impedisce la creazione se c'è già un appuntamento in quell'orario", color: "#dc2626", bg: "rgba(220,38,38,0.07)" },
    { k: "warn"   as const, icon: "⚠️", label: "Avviso + conferma", desc: "Avvisa della sovrapposizione ma lascia procedere",                  color: "#f59e0b", bg: "rgba(245,158,11,0.07)" },
    { k: "visual" as const, icon: "👁️", label: "Solo visuale",      desc: "Nessun blocco, gli appuntamenti sovrapposti appaiono affiancati",   color: THEME.teal, bg: "rgba(13,148,136,0.07)" },
  ];

  return (
    <div style={cardStyle}>
      <div style={{ ...sectionHead, cursor: "default" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Preferenze Calendario</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>Stato predefinito dei nuovi appuntamenti</div>
        </div>
      </div>
      <div style={{ padding: "18px 20px" }}>
        <label style={labelStyle}>Quando creo un nuovo appuntamento, impostalo come:</label>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          {statusOptions.map(opt => (
            <button key={opt.k} onClick={() => p.setDefaultApptStatus(opt.k)}
              style={{
                flex: 1, padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                border: p.defaultApptStatus === opt.k ? `2px solid ${opt.color}` : `1.5px solid ${THEME.border}`,
                background: p.defaultApptStatus === opt.k ? opt.bg : "#fff",
                textAlign: "left", fontFamily: "inherit",
              }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: p.defaultApptStatus === opt.k ? opt.color : THEME.text, marginBottom: 4 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: THEME.muted }}>{opt.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "rgba(13,148,136,0.04)", border: `1px solid rgba(13,148,136,0.15)`, fontSize: 11, color: THEME.muted }}>
          Vale sia per desktop che per mobile. Puoi sempre modificare lo stato di un singolo appuntamento dopo averlo creato.
        </div>

        {/* ── Gestione sovrapposizione ── */}
        <div style={{ marginTop: 20 }}>
          <label style={labelStyle}>Gestione sovrapposizione appuntamenti</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {overlapOptions.map(opt => (
              <button key={opt.k} onClick={() => p.setOverlapMode(opt.k)}
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: 10, cursor: "pointer",
                  border: p.overlapMode === opt.k ? `2px solid ${opt.color}` : `1.5px solid ${THEME.border}`,
                  background: p.overlapMode === opt.k ? opt.bg : "#fff",
                  textAlign: "left", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 12,
                }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{opt.icon}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: p.overlapMode === opt.k ? opt.color : THEME.text }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2 }}>{opt.desc}</div>
                </div>
                {p.overlapMode === opt.k && <span style={{ marginLeft: "auto", color: opt.color, fontWeight: 800, fontSize: 12 }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <BtnPrimary label={p.savingPractice ? "Salvataggio…" : "Salva preferenze"} onClick={p.onSave} disabled={p.savingPractice} />
        </div>
      </div>
    </div>
  );
}
