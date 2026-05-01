// app/(protected)/settings/components/sections/PasswordSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Cambio Password" — aggiorna la password dell'utente Supabase.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary } from "../shared/Buttons";

export type PasswordSectionProps = {
  show: boolean;
  onToggle: () => void;
  pwSaving: boolean;
  pwError: string;
  pwSuccess: string;
  pwNew: string; setPwNew: (v: string) => void;
  pwConfirm: string; setPwConfirm: (v: string) => void;
  onChange: () => void;
};

export default function PasswordSection(p: PasswordSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Cambio Password</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>Aggiorna la password di accesso</div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>
      {p.show && (
        <div style={{ padding: "20px" }}>
          {p.pwError && <div style={{ marginBottom: 12, padding: "9px 14px", borderRadius: 7, background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)", color: THEME.red, fontWeight: 600, fontSize: 13 }}>{p.pwError}</div>}
          {p.pwSuccess && <div style={{ marginBottom: 12, padding: "9px 14px", borderRadius: 7, background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.2)", color: THEME.green, fontWeight: 600, fontSize: 13 }}>{p.pwSuccess}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Nuova password</label>
              <input type="password" value={p.pwNew} onChange={e => p.setPwNew(e.target.value)} placeholder="Minimo 8 caratteri" style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Conferma nuova password</label>
              <input type="password" value={p.pwConfirm} onChange={e => p.setPwConfirm(e.target.value)} placeholder="Ripeti la nuova password" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <BtnPrimary label={p.pwSaving ? "Aggiornamento…" : "Aggiorna password"} onClick={p.onChange} disabled={p.pwSaving || !p.pwNew || !p.pwConfirm} />
          </div>
        </div>
      )}
    </div>
  );
}
