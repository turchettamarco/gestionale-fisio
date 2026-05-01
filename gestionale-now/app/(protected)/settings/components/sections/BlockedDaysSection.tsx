// app/(protected)/settings/components/sections/BlockedDaysSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Giorni di Blocco / Ferie" — non prenotabili dal sito.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import type { BlockedDay } from "../shared/types";

export type BlockedDaysSectionProps = {
  show: boolean;
  onToggle: () => void;
  savingBlock: boolean;
  blockDays: BlockedDay[];
  newBlockDate: string; setNewBlockDate: (v: string) => void;
  newBlockLabel: string; setNewBlockLabel: (v: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
};

export default function BlockedDaysSection(p: BlockedDaysSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Giorni di Blocco / Ferie</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>{p.blockDays.length} giorni bloccati · Non prenotabili dal sito</div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>
      {p.show && (
        <div style={{ padding: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 10, marginBottom: 16, alignItems: "end" }}>
            <div><label style={labelStyle}>Data</label><input type="date" value={p.newBlockDate} onChange={e => p.setNewBlockDate(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Motivo (opzionale)</label><input value={p.newBlockLabel} onChange={e => p.setNewBlockLabel(e.target.value)} placeholder="Es. Ferie, Congresso…" style={inputStyle} /></div>
            <button onClick={p.onAdd} disabled={p.savingBlock || !p.newBlockDate} style={{ padding: "9px 16px", borderRadius: 7, border: "none", background: THEME.amber, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", alignSelf: "end", opacity: p.savingBlock ? 0.6 : 1 }}>
              + Blocca
            </button>
          </div>
          {p.blockDays.length === 0 ? <div style={{ color: THEME.muted, fontSize: 12, fontStyle: "italic" }}>Nessun giorno bloccato.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {p.blockDays.map(bd => (
                <div key={bd.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderRadius: 8, border: `1px solid rgba(249,115,22,0.3)`, background: "rgba(249,115,22,0.04)" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: THEME.amber, minWidth: 90 }}>
                    {new Date(bd.date + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                  </div>
                  <div style={{ flex: 1, fontSize: 12, color: THEME.muted }}>{bd.label}</div>
                  <button onClick={() => p.onDelete(bd.id)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid rgba(220,38,38,0.3)`, background: "rgba(220,38,38,0.05)", color: THEME.red, cursor: "pointer", fontWeight: 700, fontSize: 11 }}>✕</button>
                </div>
              ))}
            </div>}
        </div>
      )}
    </div>
  );
}
