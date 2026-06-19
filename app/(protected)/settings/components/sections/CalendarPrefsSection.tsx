// app/(protected)/settings/components/sections/CalendarPrefsSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Preferenze Calendario" — stato default appuntamenti +
// gestione sovrapposizione.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, labelStyle, inputStyle } from "../shared/theme";
import { BtnPrimary } from "../shared/Buttons";
import { validatePrice } from "../shared/utils";

export type CalendarPrefsSectionProps = {
  show: boolean;
  onToggle: () => void;
  loadingPractice: boolean;
  savingPractice: boolean;
  defaultApptStatus: "confirmed" | "booked";
  setDefaultApptStatus: (v: "confirmed" | "booked") => void;
  overlapMode: "block" | "warn" | "visual";
  setOverlapMode: (v: "block" | "warn" | "visual") => void;
  // Pagamenti (mig. 015)
  paymentMethodRequired: boolean;
  setPaymentMethodRequired: (v: boolean) => void;
  defaultPaymentMethod: "cash" | "pos" | "bank_transfer";
  setDefaultPaymentMethod: (v: "cash" | "pos" | "bank_transfer") => void;
  // Auto-applica prezzi (dal catalogo trattamenti)
  autoApplyPrices: boolean;
  setAutoApplyPrices: (v: boolean) => void;
  // Appuntamenti di gruppo (mig. 014)
  defaultGroupPrice: string;
  setDefaultGroupPrice: (v: string) => void;
  defaultGroupMaxParticipants: string;
  setDefaultGroupMaxParticipants: (v: string) => void;
  groupStatsCountAsSeparate: boolean;
  setGroupStatsCountAsSeparate: (v: boolean) => void;
  /** Salva il toggle statistiche gruppo (su studios). Diverso da onSave (practice_settings). */
  onSaveGroupStats: () => void;
  savingGroupStats: boolean;
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
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Preferenze Calendario</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>Stato appuntamenti, sovrapposizioni, pagamenti, gruppi</div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>
      {p.show && (
      <div style={{ padding: "18px 20px", opacity: p.loadingPractice ? 0.7 : 1 }}>
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

        {/* ── Metodo pagamento (mig. 015) ── */}
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px dashed ${THEME.border}` }}>
          <label style={labelStyle}>Metodo di pagamento sui fatturati</label>

          <div style={{
            marginTop: 8,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 14px", borderRadius: 8,
            background: p.paymentMethodRequired ? "rgba(220,38,38,0.05)" : "rgba(13,148,136,0.05)",
            border: `1px solid ${p.paymentMethodRequired ? "rgba(220,38,38,0.2)" : "rgba(13,148,136,0.2)"}`,
          }}>
            <div style={{ flex: 1, paddingRight: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text }}>
                Selezione metodo obbligatoria
              </div>
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 3, lineHeight: 1.4 }}>
                Se attivo, sui fatturati devi sempre scegliere Contanti / POS / Bonifico prima di salvare. Se disattivato, viene usato automaticamente il default qui sotto.
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer", flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={p.paymentMethodRequired}
                onChange={e => p.setPaymentMethodRequired(e.target.checked)}
                style={{ display: "none" }}
              />
              <span style={{
                position: "relative", width: 44, height: 24,
                background: p.paymentMethodRequired ? "#dc2626" : THEME.teal,
                borderRadius: 99, transition: "background 0.2s",
              }}>
                <span style={{
                  position: "absolute", top: 2,
                  left: p.paymentMethodRequired ? 22 : 2,
                  width: 20, height: 20, background: "#fff",
                  borderRadius: 99, transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </span>
            </label>
          </div>

          {!p.paymentMethodRequired && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: THEME.muted, marginBottom: 6 }}>
                Metodo di pagamento da usare di default sui fatturati
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {([
                  { v: "cash" as const,          label: "Contanti" },
                  { v: "pos" as const,           label: "POS" },
                  { v: "bank_transfer" as const, label: "Bonifico" },
                ]).map(opt => {
                  const active = p.defaultPaymentMethod === opt.v;
                  return (
                    <button
                      key={opt.v}
                      onClick={() => p.setDefaultPaymentMethod(opt.v)}
                      style={{
                        flex: 1, padding: "9px 6px", borderRadius: 7,
                        border: `1px solid ${active ? THEME.blue : THEME.border}`,
                        background: active ? "rgba(37,99,235,0.08)" : "#fff",
                        color: active ? THEME.blue : THEME.text,
                        cursor: "pointer", fontWeight: 700, fontSize: 12,
                      }}
                    >{opt.label}</button>
                  );
                })}
              </div>
            </div>
          )}
        </div>


        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <BtnPrimary label={p.savingPractice ? "Salvataggio…" : "Salva preferenze"} onClick={p.onSave} disabled={p.savingPractice} />
        </div>

        {/* ── Auto-applica prezzi dal catalogo ── */}
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px dashed ${THEME.border}` }}>
          <label style={labelStyle}>Prezzi dei nuovi appuntamenti</label>
          <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: "#fff" }}>
            <input type="checkbox" id="auto-apply" checked={p.autoApplyPrices} onChange={e => p.setAutoApplyPrices(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2, cursor: "pointer" }} />
            <label htmlFor="auto-apply" style={{ cursor: "pointer" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text }}>Applica automaticamente il prezzo del trattamento</div>
              <div style={{ fontSize: 12, color: THEME.muted, marginTop: 3 }}>Pre-compila il prezzo dal Catalogo Trattamenti quando crei un appuntamento. Se disattivato, lo imposti a mano ogni volta.</div>
            </label>
          </div>
        </div>

        {/* ── Appuntamenti di gruppo (mig. 014) ── */}
        <div style={{ marginTop: 20, padding: 16, borderRadius: 10, border: `2px solid ${THEME.teal}33`, background: `${THEME.teal}08` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>👥</span>
            <div style={{ fontWeight: 700, fontSize: 14, color: THEME.teal }}>Appuntamenti di gruppo</div>
          </div>
          <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 14 }}>
            Default per gli appuntamenti di gruppo (Posturale, Pilates, ecc.). Modificabili per singolo appuntamento e per singolo paziente.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Prezzo per persona</label>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: THEME.muted }}>€</span>
                <input value={p.defaultGroupPrice} onChange={e => p.setDefaultGroupPrice(validatePrice(e.target.value))} style={{ ...inputStyle, textAlign: "right", fontWeight: 700, fontSize: 14, padding: "7px 10px" }} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Max partecipanti</label>
              <input type="number" min={2} max={50} value={p.defaultGroupMaxParticipants} onChange={e => p.setDefaultGroupMaxParticipants(e.target.value.replace(/[^0-9]/g, ""))} style={{ ...inputStyle, fontWeight: 700, fontSize: 14, padding: "7px 10px" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 8, border: `1px solid ${THEME.teal}33`, background: "#fff", marginBottom: 14 }}>
            <input type="checkbox" id="group-stats-separate" checked={p.groupStatsCountAsSeparate} onChange={e => p.setGroupStatsCountAsSeparate(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2, cursor: "pointer" }} />
            <label htmlFor="group-stats-separate" style={{ cursor: "pointer", flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text }}>Conta come appuntamenti separati nelle statistiche</div>
              <div style={{ fontSize: 12, color: THEME.muted, marginTop: 3, lineHeight: 1.5 }}>
                <strong>OFF:</strong> 1 gruppo da 75€ = 1 appuntamento nei report.<br />
                <strong>ON:</strong> 5 partecipanti × 15€ = 5 appuntamenti separati nei report.
              </div>
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <BtnPrimary
              label={(p.savingPractice || p.savingGroupStats) ? "Salvataggio…" : "Salva impostazioni gruppo"}
              onClick={() => { p.onSave(); p.onSaveGroupStats(); }}
              disabled={p.loadingPractice || p.savingPractice || p.savingGroupStats}
            />
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
