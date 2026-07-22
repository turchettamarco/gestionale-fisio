// app/(protected)/settings/components/sections/AgendaViewPrefsSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Preferenze agenda — granularità slot (mig. 061) + vista predefinita
// all'apertura (mig. 023). Studio-wide, condivisa desktop/mobile.
// Il layout settimana multi-operatore resta in Team: dipende da quel modulo.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle } from "../shared/theme";

export type AgendaViewPrefsSectionProps = {
  slotValue: 15 | 30;
  slotSaving: boolean;
  onSaveSlot: (v: 15 | 30) => void;
  viewValue: "day" | "week" | "month";
  setViewValue: (v: "day" | "week" | "month") => void;
  viewSaving: boolean;
  onSaveView: () => void;
};

export default function AgendaViewPrefsSection(p: AgendaViewPrefsSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text, marginBottom: 4 }}>
          Preferenze agenda
        </div>
        <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 14, lineHeight: 1.5 }}>
          Granularità degli orari e vista con cui si apre il calendario. Valgono per tutto lo studio, su tutti i dispositivi.
        </div>

        <div style={{ fontWeight: 700, fontSize: 13.5, color: THEME.text, marginBottom: 8 }}>Granularità</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {([
            { k: 30 as const, label: "30 minuti", desc: "Mezz'ore classiche (09:00, 09:30)" },
            { k: 15 as const, label: "15 minuti", desc: "Quarti d'ora (09:00, 09:15, 09:30, 09:45)" },
          ]).map(opt => {
            const active = p.slotValue === opt.k;
            return (
              <button key={opt.k} type="button" disabled={p.slotSaving} onClick={() => p.onSaveSlot(opt.k)}
                style={{ flex: "1 1 180px", minWidth: 180, padding: "12px 14px",
                  border: `2px solid ${active ? THEME.teal : THEME.border}`,
                  background: active ? "rgba(13,148,136,0.04)" : "#fff",
                  borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  transition: "all 0.15s", opacity: p.slotSaving ? 0.7 : 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: active ? THEME.teal : THEME.text, marginBottom: 3 }}>
                  {opt.label}{active ? " ✓" : ""}
                </div>
                <div style={{ fontSize: 11, color: THEME.muted, fontWeight: 500 }}>{opt.desc}</div>
              </button>
            );
          })}
        </div>

        <div style={{ fontWeight: 700, fontSize: 13.5, color: THEME.text, marginBottom: 4 }}>Vista predefinita calendario</div>
        <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 10, lineHeight: 1.5 }}>
          Con quale vista si apre il calendario. La scelta fatta durante la sessione non viene ricordata: vale solo come vista iniziale.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {([
            { k: "day" as const,   label: "Giorno" },
            { k: "week" as const,  label: "Settimana" },
            { k: "month" as const, label: "Mese" },
          ]).map(opt => {
            const active = p.viewValue === opt.k;
            return (
              <button key={opt.k} type="button" onClick={() => p.setViewValue(opt.k)}
                style={{ padding: "10px 18px", border: `2px solid ${active ? THEME.teal : THEME.border}`,
                  background: active ? "rgba(13,148,136,0.04)" : "#fff", borderRadius: 10,
                  cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                  fontWeight: active ? 800 : 600, color: active ? THEME.teal : THEME.text }}>
                {opt.label}{active ? " ✓" : ""}
              </button>
            );
          })}
          <button type="button" disabled={p.viewSaving} onClick={p.onSaveView}
            style={{ marginLeft: "auto", padding: "10px 18px", borderRadius: 9, border: "none",
              background: THEME.teal, color: "#fff", fontWeight: 700, fontSize: 13,
              cursor: "pointer", opacity: p.viewSaving ? 0.6 : 1 }}>
            {p.viewSaving ? "Salvataggio…" : "Salva vista"}
          </button>
        </div>
      </div>
    </div>
  );
}
