// app/(protected)/settings/components/sections/ManagementSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Parametri Gestione" — obiettivo fatturato, soglia inattività,
// ore promemoria.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary } from "../shared/Buttons";

export type ManagementSectionProps = {
  show: boolean;
  onToggle: () => void;
  savingPractice: boolean;
  monthlyGoal: string; setMonthlyGoal: (v: string) => void;
  inactiveThresh: string; setInactiveThresh: (v: string) => void;
  reminderHours: string; setReminderHours: (v: string) => void;
  onSave: () => void;
};

export default function ManagementSection(p: ManagementSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Parametri Gestione</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>Obiettivo fatturato · Soglia inattività · Promemoria</div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>
      {p.show && (
        <div style={{ padding: "20px" }}>
          <div className="settings-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Obiettivo fatturato mensile (€)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: THEME.muted }}>€</span>
                <input type="number" value={p.monthlyGoal} onChange={e => p.setMonthlyGoal(e.target.value)} min={0} step={100} style={{ ...inputStyle, textAlign: "right", fontWeight: 700 }} />
              </div>
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>Usato nella barra di progressione nei Report</div>
            </div>
            <div>
              <label style={labelStyle}>Soglia paziente inattivo (giorni)</label>
              <input type="number" value={p.inactiveThresh} onChange={e => p.setInactiveThresh(e.target.value)} min={7} max={365} style={{ ...inputStyle, textAlign: "right", fontWeight: 700 }} />
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>Pazienti non visti da più di X giorni → avviso dashboard</div>
            </div>
            <div>
              <label style={labelStyle}>Promemoria WA (ore prima)</label>
              <input type="number" value={p.reminderHours} onChange={e => p.setReminderHours(e.target.value)} min={1} max={72} style={{ ...inputStyle, textAlign: "right", fontWeight: 700 }} />
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>Riferimento per quando inviare i promemoria</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <BtnPrimary label={p.savingPractice ? "Salvataggio…" : "Salva parametri"} onClick={p.onSave} disabled={p.savingPractice} />
          </div>
        </div>
      )}
    </div>
  );
}
