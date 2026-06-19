// app/(protected)/settings/components/sections/AccountingSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Pagamenti & Obiettivo" (tab Contabilità & Fiscale).
// Raccoglie le impostazioni contabili che condividono il salvataggio su
// practice_settings:
//   • Metodo di pagamento sui fatturati (mig. 015)
//   • Obiettivo fatturato mensile (barra di progressione nei Report)
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary } from "../shared/Buttons";

export type AccountingSectionProps = {
  show: boolean;
  onToggle: () => void;
  savingPractice: boolean;
  // Pagamenti (mig. 015)
  paymentMethodRequired: boolean;
  setPaymentMethodRequired: (v: boolean) => void;
  defaultPaymentMethod: "cash" | "pos" | "bank_transfer";
  setDefaultPaymentMethod: (v: "cash" | "pos" | "bank_transfer") => void;
  // Obiettivo fatturato
  monthlyGoal: string;
  setMonthlyGoal: (v: string) => void;
  onSave: () => void;
};

export default function AccountingSection(p: AccountingSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Pagamenti & Obiettivo</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>Metodo di pagamento sui fatturati · obiettivo fatturato mensile</div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "18px 20px" }}>
          {/* ── Metodo pagamento (mig. 015) ── */}
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

          {/* ── Obiettivo fatturato ── */}
          <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px dashed ${THEME.border}` }}>
            <label style={labelStyle}>Obiettivo fatturato mensile</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, maxWidth: 220 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: THEME.muted }}>€</span>
              <input
                type="number"
                value={p.monthlyGoal}
                onChange={e => p.setMonthlyGoal(e.target.value)}
                min={0}
                step={100}
                style={{ ...inputStyle, textAlign: "right", fontWeight: 700 }}
              />
            </div>
            <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>Usato nella barra di progressione nei Report</div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <BtnPrimary label={p.savingPractice ? "Salvataggio…" : "Salva impostazioni"} onClick={p.onSave} disabled={p.savingPractice} />
          </div>
        </div>
      )}
    </div>
  );
}
