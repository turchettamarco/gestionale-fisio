// app/(protected)/settings/components/sections/BookableServicesSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Servizi Prenotabili Online" — visibili nel booking pubblico.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import type { BookableService } from "../shared/types";

export type BookableServicesSectionProps = {
  show: boolean;
  onToggle: () => void;
  loadingServices: boolean;
  savingSvc: boolean;
  services: BookableService[];
  newSvcName: string; setNewSvcName: (v: string) => void;
  newSvcDuration: string; setNewSvcDuration: (v: string) => void;
  newSvcPrice: string; setNewSvcPrice: (v: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
};

export default function BookableServicesSection(p: BookableServicesSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Servizi Prenotabili Online</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>{p.services.length} servizi configurati · Visibili nel booking pubblico</div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>
      {p.show && (
        <div style={{ padding: "20px" }}>
          {/* Aggiungi nuovo */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px auto", gap: 10, marginBottom: 16, alignItems: "end" }}>
            <div><label style={labelStyle}>Nome servizio</label><input value={p.newSvcName} onChange={e => p.setNewSvcName(e.target.value)} placeholder="Es. Visita osteopatica" style={inputStyle} /></div>
            <div><label style={labelStyle}>Durata (min)</label><input type="number" value={p.newSvcDuration} onChange={e => p.setNewSvcDuration(e.target.value)} min={5} step={5} style={{ ...inputStyle, textAlign: "right" }} /></div>
            <div><label style={labelStyle}>Prezzo (€)</label><input type="number" value={p.newSvcPrice} onChange={e => p.setNewSvcPrice(e.target.value)} min={0} step={1} style={{ ...inputStyle, textAlign: "right" }} /></div>
            <button onClick={p.onAdd} disabled={p.savingSvc || !p.newSvcName.trim()} style={{ padding: "9px 16px", borderRadius: 7, border: "none", background: THEME.teal, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", alignSelf: "end", opacity: p.savingSvc ? 0.6 : 1 }}>
              + Aggiungi
            </button>
          </div>

          {/* Lista */}
          {p.loadingServices ? <div style={{ color: THEME.muted, fontSize: 12 }}>Caricamento…</div>
            : p.services.length === 0 ? <div style={{ color: THEME.muted, fontSize: 12, fontStyle: "italic" }}>Nessun servizio configurato.</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {p.services.map(svc => (
                  <div key={svc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: THEME.panelSoft }}>
                    <div style={{ flex: 1, fontWeight: 700, fontSize: 13, color: THEME.text }}>{svc.name}</div>
                    <div style={{ fontSize: 12, color: THEME.muted }}>{svc.duration} min</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: THEME.teal }}>€{svc.price}</div>
                    <button onClick={() => p.onDelete(svc.id)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid rgba(220,38,38,0.3)`, background: "rgba(220,38,38,0.05)", color: THEME.red, cursor: "pointer", fontWeight: 700, fontSize: 11 }}>✕</button>
                  </div>
                ))}
              </div>}
        </div>
      )}
    </div>
  );
}
