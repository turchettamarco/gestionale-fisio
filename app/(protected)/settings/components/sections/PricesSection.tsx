// app/(protected)/settings/components/sections/PricesSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Tariffe Trattamenti".
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary, BtnOutline } from "../shared/Buttons";
import { validatePrice } from "../shared/utils";

export type PricesSectionProps = {
  show: boolean;
  onToggle: () => void;
  loadingPractice: boolean;
  savingPractice: boolean;

  standardInvoice: string; setStandardInvoice: (v: string) => void;
  standardCash: string; setStandardCash: (v: string) => void;
  machineInvoice: string; setMachineInvoice: (v: string) => void;
  machineCash: string; setMachineCash: (v: string) => void;
  laserInvoice: string; setLaserInvoice: (v: string) => void;
  laserCash: string; setLaserCash: (v: string) => void;
  tecarInvoice: string; setTecarInvoice: (v: string) => void;
  tecarCash: string; setTecarCash: (v: string) => void;
  ondeUrtoInvoice: string; setOndeUrtoInvoice: (v: string) => void;
  ondeUrtoCash: string; setOndeUrtoCash: (v: string) => void;
  tensInvoice: string; setTensInvoice: (v: string) => void;
  tensCash: string; setTensCash: (v: string) => void;

  autoApplyPrices: boolean; setAutoApplyPrices: (v: boolean) => void;
  onReload: () => void;
  onSave: () => void;
};

export default function PricesSection(p: PricesSectionProps) {
  const priceCards = [
    { title: "Seduta",      subtitle: "Trattamento manuale completo", iv: p.standardInvoice, setIv: p.setStandardInvoice, cv: p.standardCash,   setCv: p.setStandardCash,   color: "#0d9488" },
    { title: "Macchinario", subtitle: "Terapia strumentale generica", iv: p.machineInvoice,  setIv: p.setMachineInvoice,  cv: p.machineCash,    setCv: p.setMachineCash,    color: "#2563eb" },
    { title: "Laser",       subtitle: "Terapia laser",                iv: p.laserInvoice,    setIv: p.setLaserInvoice,    cv: p.laserCash,      setCv: p.setLaserCash,      color: "#d97706" },
    { title: "Tecar",       subtitle: "Tecarterapia",                 iv: p.tecarInvoice,    setIv: p.setTecarInvoice,    cv: p.tecarCash,      setCv: p.setTecarCash,      color: "#ea580c" },
    { title: "Onde d'urto", subtitle: "Terapia onde d'urto",          iv: p.ondeUrtoInvoice, setIv: p.setOndeUrtoInvoice, cv: p.ondeUrtoCash,   setCv: p.setOndeUrtoCash,   color: "#7c3aed" },
    { title: "TENS",        subtitle: "Elettrostimolazione TENS",     iv: p.tensInvoice,     setIv: p.setTensInvoice,     cv: p.tensCash,       setCv: p.setTensCash,       color: "#059669" },
  ];

  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Tariffe Trattamenti</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            {p.autoApplyPrices ? "Auto-applica attivo" : "Auto-applica disattivo"}
          </div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "20px", opacity: p.loadingPractice ? 0.7 : 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {priceCards.map(pc => (
              <div key={pc.title} style={{ padding: 14, borderRadius: 10, border: `2px solid ${pc.color}22`, background: `${pc.color}08`, display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: pc.color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: pc.color }}>{pc.title}</div>
                    <div style={{ fontSize: 11, color: THEME.muted }}>{pc.subtitle}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flex: 1 }}>
                  <div>
                    <label style={labelStyle}>Con ricevuta</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: THEME.muted }}>€</span>
                      <input value={pc.iv} onChange={e => pc.setIv(validatePrice(e.target.value))} style={{ ...inputStyle, textAlign: "right", fontWeight: 700, fontSize: 14, padding: "7px 10px" }} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>In contanti</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: THEME.muted }}>€</span>
                      <input value={pc.cv} onChange={e => pc.setCv(validatePrice(e.target.value))} style={{ ...inputStyle, textAlign: "right", fontWeight: 700, fontSize: 14, padding: "7px 10px" }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: "#fff", marginBottom: 20 }}>
            <input type="checkbox" id="auto-apply" checked={p.autoApplyPrices} onChange={e => p.setAutoApplyPrices(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2, cursor: "pointer", color: "#2563eb" }} />
            <label htmlFor="auto-apply" style={{ cursor: "pointer" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text }}>Applica automaticamente nei nuovi appuntamenti</div>
              <div style={{ fontSize: 12, color: THEME.muted, marginTop: 3 }}>Se disattivato, selezioni il prezzo manualmente per ogni appuntamento.</div>
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <BtnOutline label="Ricarica" onClick={p.onReload} disabled={p.loadingPractice || p.savingPractice} />
            <BtnPrimary label={p.savingPractice ? "Salvataggio…" : "Salva tariffe"} onClick={p.onSave} disabled={p.loadingPractice || p.savingPractice} />
          </div>
        </div>
      )}
    </div>
  );
}
