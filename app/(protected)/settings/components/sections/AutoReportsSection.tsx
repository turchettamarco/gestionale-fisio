// app/(protected)/settings/components/sections/AutoReportsSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Report automatici" (tab Contabilità & Fiscale).
// Spostata da StudioBranding (mig. 039). Riepiloghi PDF (sedute, incassi,
// nuovi pazienti) inviati via email con cadenza mensile/trimestrale/annuale.
// Salva su tabella studios via saveStudio.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead } from "../shared/theme";
import { BtnPrimary } from "../shared/Buttons";

export type AutoReportsSectionProps = {
  show: boolean;
  onToggle: () => void;
  savingStudio: boolean;
  reportMonthlyEnabled: boolean; setReportMonthlyEnabled: (v: boolean) => void;
  reportQuarterlyEnabled: boolean; setReportQuarterlyEnabled: (v: boolean) => void;
  reportYearlyEnabled: boolean; setReportYearlyEnabled: (v: boolean) => void;
  reportEmail: string; setReportEmail: (v: string) => void;
  onSave: () => void;
};

export default function AutoReportsSection(p: AutoReportsSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>📄 Report automatici</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>Riepiloghi PDF via email · sedute, incassi, nuovi pazienti</div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "20px" }}>
          <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 14, lineHeight: 1.5 }}>
            Ricevi un riepilogo PDF con sedute, incassi e nuovi pazienti. Ogni cadenza è indipendente: attiva quelle che ti servono.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <ToggleRow
              label="Report mensile"
              description="Il 1° di ogni mese, riepilogo del mese precedente"
              checked={p.reportMonthlyEnabled}
              onChange={p.setReportMonthlyEnabled}
            />
            <ToggleRow
              label="Report trimestrale"
              description="A inizio gennaio, aprile, luglio e ottobre"
              checked={p.reportQuarterlyEnabled}
              onChange={p.setReportQuarterlyEnabled}
            />
            <ToggleRow
              label="Report annuale"
              description="Il 1° gennaio, riepilogo dell'anno appena concluso"
              checked={p.reportYearlyEnabled}
              onChange={p.setReportYearlyEnabled}
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: THEME.text, marginBottom: 5 }}>
              Invia i report a
            </label>
            <input
              type="email"
              value={p.reportEmail}
              onChange={e => p.setReportEmail(e.target.value)}
              placeholder="Lascia vuoto per usare la tua email di accesso"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px",
                borderRadius: 9, border: `1px solid ${THEME.border}`, fontSize: 14,
                fontFamily: "inherit", color: THEME.text }}
            />
            <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 5, lineHeight: 1.5 }}>
              Se vuoto, i report arrivano all&apos;indirizzo con cui accedi. Puoi indicarne un altro (es. segreteria o commercialista).
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <BtnPrimary label={p.savingStudio ? "Salvataggio…" : "Salva report"} onClick={p.onSave} disabled={p.savingStudio} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ToggleRow: switch on/off con label e descrizione ──────────────────
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "12px 14px",
        borderRadius: 8,
        border: `1px solid ${THEME.border}`,
        background: checked ? "rgba(13,148,136,0.04)" : "#fff",
        transition: "background 0.15s",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: THEME.text, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 11, color: THEME.muted, lineHeight: 1.4 }}>{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24,
          borderRadius: 12,
          border: "none",
          background: checked ? THEME.teal : "#cbd5e1",
          position: "relative",
          cursor: "pointer",
          transition: "background 0.2s",
          flexShrink: 0,
          padding: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 22 : 2,
            width: 20, height: 20,
            borderRadius: "50%",
            background: "#fff",
            transition: "left 0.2s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />
      </button>
    </div>
  );
}
