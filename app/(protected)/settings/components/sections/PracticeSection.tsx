// app/(protected)/settings/components/sections/PracticeSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Dati Studio" — anagrafica fiscale + logo + Google Review.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary, BtnOutline } from "../shared/Buttons";

export type PracticeSectionProps = {
  show: boolean;
  onToggle: () => void;
  loadingPractice: boolean;
  savingPractice: boolean;
  practiceName: string; setPracticeName: (v: string) => void;
  ownerFullName: string; setOwnerFullName: (v: string) => void;
  vatNumber: string; setVatNumber: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  pecEmail: string; setPecEmail: (v: string) => void;
  address: string; setAddress: (v: string) => void;
  logoBase64: string; setLogoBase64: (v: string) => void;
  googleReviewLink: string; setGoogleReviewLink: (v: string) => void;
  onReload: () => void;
  onSave: () => void;
};

export default function PracticeSection(p: PracticeSectionProps) {
  const fields = [
    { label: "Nome studio",             value: p.practiceName,  set: p.setPracticeName  },
    { label: "Titolare (nome cognome)", value: p.ownerFullName, set: p.setOwnerFullName },
    { label: "Partita IVA",             value: p.vatNumber,     set: p.setVatNumber     },
    { label: "Telefono studio",         value: p.phone,         set: p.setPhone         },
    { label: "PEC",                     value: p.pecEmail,      set: p.setPecEmail      },
  ];

  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Dati Studio</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            {p.loadingPractice ? "Caricamento…" : "Anagrafica e contatti dello studio"}
          </div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "20px", opacity: p.loadingPractice ? 0.7 : 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
            {fields.map(f => (
              <div key={f.label}>
                <label style={labelStyle}>{f.label}</label>
                <input value={f.value} onChange={e => f.set(e.target.value)} style={inputStyle} />
              </div>
            ))}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Indirizzo</label>
              <input value={p.address} onChange={e => p.setAddress(e.target.value)} style={inputStyle} />
            </div>

            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Logo studio (appare su PDF, ricevute, schede esercizi)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                {p.logoBase64 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logoBase64} alt="Logo" style={{ height: 48, objectFit: "contain", borderRadius: 6, border: `1px solid ${THEME.border}` }} />
                )}
                <label style={{ padding: "8px 16px", borderRadius: 7, border: `1.5px solid ${THEME.teal}`, background: "rgba(13,148,136,0.06)", color: THEME.teal, fontWeight: 700, fontSize: 12, cursor: "pointer", display: "inline-block" }}>
                  {p.logoBase64 ? "📷 Cambia logo" : "📷 Carica logo"}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 200000) { alert("Logo max 200KB"); return; }
                      const r = new FileReader();
                      r.onload = ev => p.setLogoBase64(ev.target!.result as string);
                      r.readAsDataURL(file);
                    }}
                  />
                </label>
                {p.logoBase64 && (
                  <button onClick={() => p.setLogoBase64("")} style={{ padding: "8px 12px", borderRadius: 7, border: `1px solid ${THEME.border}`, background: "transparent", color: THEME.muted, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                    ✕ Rimuovi
                  </button>
                )}
                <span style={{ fontSize: 11, color: THEME.muted }}>Max 200KB · PNG/JPG · appare su tutti i documenti generati</span>
              </div>
            </div>

            <div style={{ gridColumn: "1/-1" }}>
              <label style={labelStyle}>Link Google Review (per richiesta recensioni WA)</label>
              <input
                value={p.googleReviewLink}
                onChange={e => p.setGoogleReviewLink(e.target.value)}
                placeholder="https://g.page/r/..."
                style={inputStyle}
              />
              {p.googleReviewLink && (
                <div style={{ marginTop: 6, fontSize: 11, color: THEME.teal, fontWeight: 600 }}>
                  ✓ Link configurato — verrà usato nei messaggi WhatsApp di richiesta recensione
                </div>
              )}
              {!p.googleReviewLink && (
                <div style={{ marginTop: 6, fontSize: 11, color: THEME.amber, fontWeight: 600 }}>
                  ⚠ Link non configurato — il bottone recensione nel calendario non funzionerà correttamente
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <BtnOutline label="Ricarica" onClick={p.onReload} disabled={p.loadingPractice || p.savingPractice} />
            <BtnPrimary label={p.savingPractice ? "Salvataggio…" : "Salva dati studio"} onClick={p.onSave} disabled={p.loadingPractice || p.savingPractice} />
          </div>
        </div>
      )}
    </div>
  );
}
