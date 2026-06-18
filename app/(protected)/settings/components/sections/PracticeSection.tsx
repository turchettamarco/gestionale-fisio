// app/(protected)/settings/components/sections/PracticeSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Dati fiscali" — solo dati fiscali interni (non visibili ai pazienti).
// Tutti i dati paziente-visibili (nome, indirizzo, telefono, email, sito,
// google review, firma, logo) sono in StudioBrandingSection → tabella `studios`.
// Qui restano Titolare, P.IVA, PEC + config Sistema TS → tabella `practice_settings`.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary, BtnOutline } from "../shared/Buttons";
import { TIPI_SPESA } from "@/src/lib/contabilita/tsTipiSpesa";

export type PracticeSectionProps = {
  show: boolean;
  onToggle: () => void;
  loadingPractice: boolean;
  savingPractice: boolean;
  ownerFullName: string; setOwnerFullName: (v: string) => void;
  vatNumber: string; setVatNumber: (v: string) => void;
  pecEmail: string; setPecEmail: (v: string) => void;
  tsEnabled: boolean; setTsEnabled: (v: boolean) => void;
  tsTipoSpesaDefault: string; setTsTipoSpesaDefault: (v: string) => void;
  onReload: () => void;
  onSave: () => void;
};

export default function PracticeSection(p: PracticeSectionProps) {
  const fields = [
    { label: "Titolare (nome cognome)", value: p.ownerFullName, set: p.setOwnerFullName, placeholder: "Es. Dott. Mario Rossi" },
    { label: "Partita IVA",             value: p.vatNumber,     set: p.setVatNumber,     placeholder: "Es. 12345678901" },
    { label: "PEC",                     value: p.pecEmail,      set: p.setPecEmail,      placeholder: "Es. mariorossi@pec.it" },
  ];

  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>📋 Dati fiscali</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            {p.loadingPractice ? "Caricamento…" : "Titolare, Partita IVA, PEC, Sistema Tessera Sanitaria"}
          </div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "20px", opacity: p.loadingPractice ? 0.7 : 1 }}>
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(148,163,184,0.06)", border: `1px solid ${THEME.border}`, marginBottom: 20, fontSize: 12, color: THEME.muted }}>
            <strong style={{ color: THEME.text }}>ℹ️ Nota:</strong> questi dati sono <strong>interni</strong>, usati per ricevute e adempimenti fiscali. Non vengono mostrati ai pazienti. I dati pubblici (nome studio, indirizzo, contatti, firma) sono nella sezione <strong>&ldquo;Il tuo Studio&rdquo;</strong>.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
            {fields.map((f, idx) => (
              <div key={f.label} style={{ gridColumn: idx === 0 ? "1 / -1" : "auto" }}>
                <label style={labelStyle}>{f.label}</label>
                <input
                  value={f.value}
                  onChange={e => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>

          {/* ─── Sistema Tessera Sanitaria ─────────────────────────────── */}
          <div style={{ borderTop: `1px solid ${THEME.border}`, paddingTop: 18, marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text, marginBottom: 4 }}>🩺 Sistema Tessera Sanitaria</div>
            <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 16 }}>
              Invio dei dati di spesa sanitaria (730 precompilato). La gestione e l&rsquo;export si trovano nella sezione <strong>Contabilità</strong>.
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={p.tsEnabled}
                onChange={e => p.setTsEnabled(e.target.checked)}
                style={{ width: 18, height: 18, cursor: "pointer", accentColor: THEME.teal }}
              />
              <span style={{ fontSize: 13, color: THEME.text, fontWeight: 600 }}>
                Sono soggetto obbligato all&rsquo;invio al Sistema TS
              </span>
            </label>

            <div style={{ maxWidth: 360, opacity: p.tsEnabled ? 1 : 0.5 }}>
              <label style={labelStyle}>Tipo spesa di default</label>
              <select
                value={p.tsTipoSpesaDefault}
                onChange={e => p.setTsTipoSpesaDefault(e.target.value)}
                disabled={!p.tsEnabled}
                style={{ ...inputStyle, cursor: p.tsEnabled ? "pointer" : "not-allowed" }}
              >
                {TIPI_SPESA.map(t => (
                  <option key={t.code} value={t.code}>{t.code} · {t.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 6 }}>
                Per fisioterapista/osteopata la prestazione tipica è <strong>SP</strong>. Conferma il codice corretto con il tuo commercialista.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <BtnOutline label="Ricarica" onClick={p.onReload} disabled={p.loadingPractice || p.savingPractice} />
            <BtnPrimary label={p.savingPractice ? "Salvataggio…" : "Salva dati fiscali"} onClick={p.onSave} disabled={p.loadingPractice || p.savingPractice} />
          </div>
        </div>
      )}
    </div>
  );
}
