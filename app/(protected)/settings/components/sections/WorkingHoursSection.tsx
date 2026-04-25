// app/(protected)/settings/components/sections/WorkingHoursSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Orari di Lavoro" — usata dal sistema di prenotazione online.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary, BtnOutline } from "../shared/Buttons";
import { DAY_LABELS, DAY_ORDER_ISO, type WorkingHourRow } from "../shared/types";

export type WorkingHoursSectionProps = {
  show: boolean;
  onToggle: () => void;
  loadingHours: boolean;
  savingHours: boolean;
  workingHours: WorkingHourRow[];
  onUpdateHour: (day: number, patch: Partial<WorkingHourRow>) => void;
  onReload: () => void;
  onSave: () => void;
};

export default function WorkingHoursSection(p: WorkingHoursSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Orari di Lavoro</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            {p.loadingHours ? "Caricamento…" : `Usati dal sistema di prenotazione online — ${p.workingHours.filter(h => h.is_open).length} giorni aperti`}
          </div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "20px", opacity: p.loadingHours ? 0.6 : 1 }}>
          <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 14, lineHeight: 1.5 }}>
            Questi orari determinano gli slot disponibili per la <strong>prenotazione online</strong> dal sito pubblico.
            Disattiva un giorno per non accettare prenotazioni automatiche in quella giornata.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {DAY_ORDER_ISO.map(dayNum => {
              const h = p.workingHours.find(w => w.day_of_week === dayNum);
              if (!h) return null;
              return (
                <div key={dayNum} style={{
                  display: "grid",
                  gridTemplateColumns: "110px 80px 1fr 1fr",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: `1px solid ${THEME.border}`,
                  background: h.is_open ? "#fff" : THEME.panelSoft,
                  opacity: h.is_open ? 1 : 0.6,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: THEME.text }}>{DAY_LABELS[dayNum]}</div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, color: h.is_open ? THEME.teal : THEME.muted }}>
                    <input
                      type="checkbox"
                      checked={h.is_open}
                      onChange={e => p.onUpdateHour(dayNum, { is_open: e.target.checked })}
                      style={{ width: 15, height: 15, cursor: "pointer", color: "#2563eb" }}
                    />
                    {h.is_open ? "Aperto" : "Chiuso"}
                  </label>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 3 }}>Apertura</label>
                    <input
                      type="time"
                      value={h.open_time}
                      onChange={e => p.onUpdateHour(dayNum, { open_time: e.target.value })}
                      disabled={!h.is_open}
                      style={{ ...inputStyle, padding: "6px 10px", fontSize: 13, opacity: h.is_open ? 1 : 0.5 }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 3 }}>Chiusura</label>
                    <input
                      type="time"
                      value={h.close_time}
                      onChange={e => p.onUpdateHour(dayNum, { close_time: e.target.value })}
                      disabled={!h.is_open}
                      style={{ ...inputStyle, padding: "6px 10px", fontSize: 13, opacity: h.is_open ? 1 : 0.5 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <BtnOutline label="Ricarica" onClick={p.onReload} disabled={p.loadingHours || p.savingHours} />
            <BtnPrimary label={p.savingHours ? "Salvataggio…" : "Salva orari"} onClick={p.onSave} disabled={p.loadingHours || p.savingHours} />
          </div>
        </div>
      )}
    </div>
  );
}
