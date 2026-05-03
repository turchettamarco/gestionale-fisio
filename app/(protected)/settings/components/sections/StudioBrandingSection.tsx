// app/(protected)/settings/components/sections/StudioBrandingSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Il tuo Studio" — branding multi-tenancy (tabella studios).
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary } from "../shared/Buttons";

export type StudioBrandingSectionProps = {
  show: boolean;
  onToggle: () => void;
  studioName: string; setStudioName: (v: string) => void;
  studioAddress: string; setStudioAddress: (v: string) => void;
  studioPhone: string; setStudioPhone: (v: string) => void;
  studioEmail: string; setStudioEmail: (v: string) => void;
  studioWebsite: string; setStudioWebsite: (v: string) => void;
  studioGoogleReview: string; setStudioGoogleReview: (v: string) => void;
  studioSignatureName: string; setStudioSignatureName: (v: string) => void;
  studioSignatureTitle: string; setStudioSignatureTitle: (v: string) => void;
  // Logo (multi-tenancy: salvato su studios.logo_base64)
  logoBase64: string; setLogoBase64: (v: string) => void;
  savingStudio: boolean;
  onSave: () => void;
};

export default function StudioBrandingSection(p: StudioBrandingSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>
            🏥 Il tuo Studio
          </div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            Nome, indirizzo, firma messaggi · Usato in WhatsApp, PDF, link pubblici
          </div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "20px" }}>
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(13,148,136,0.05)", border: `1px solid rgba(13,148,136,0.2)`, marginBottom: 20, fontSize: 12, color: THEME.muted }}>
            <strong style={{ color: THEME.teal }}>💡 Suggerimento:</strong> questi dati vengono usati automaticamente nei messaggi WhatsApp, nei PDF e nelle pagine pubbliche (portale paziente, conferma appuntamenti). Compila soprattutto la firma — sarà il nome mostrato ai tuoi pazienti.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Nome studio *</label>
              <input
                value={p.studioName}
                onChange={e => p.setStudioName(e.target.value)}
                placeholder="Es. FisioHub"
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                Nome che identifica il tuo studio nel sistema
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1", marginTop: 8, paddingTop: 16, borderTop: `1px solid ${THEME.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Firma nei messaggi WhatsApp
              </div>
            </div>

            <div>
              <label style={labelStyle}>Nome operatore *</label>
              <input
                value={p.studioSignatureName}
                onChange={e => p.setStudioSignatureName(e.target.value)}
                placeholder="Es. Dr. Mario Rossi"
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                Firma dell&apos;operatore nei messaggi
              </div>
            </div>

            <div>
              <label style={labelStyle}>Qualifica professionale</label>
              <input
                value={p.studioSignatureTitle}
                onChange={e => p.setStudioSignatureTitle(e.target.value)}
                placeholder="Es. Fisioterapia e Osteopatia"
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                Specialità/disciplina sotto la firma
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1", marginTop: 8, paddingTop: 16, borderTop: `1px solid ${THEME.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Contatti e indirizzo
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Indirizzo studio</label>
              <input
                value={p.studioAddress}
                onChange={e => p.setStudioAddress(e.target.value)}
                placeholder="Es. Via Roma 10, 20100 Milano (MI)"
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                Indirizzo mostrato nei messaggi di promemoria
              </div>
            </div>

            <div>
              <label style={labelStyle}>Telefono</label>
              <input
                value={p.studioPhone}
                onChange={e => p.setStudioPhone(e.target.value)}
                placeholder="Es. +39 333 1234567"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={p.studioEmail}
                onChange={e => p.setStudioEmail(e.target.value)}
                placeholder="info@fisiohub.it"
                style={inputStyle}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Sito web (opzionale)</label>
              <input
                value={p.studioWebsite}
                onChange={e => p.setStudioWebsite(e.target.value)}
                placeholder="https://www.miostudio.it"
                style={inputStyle}
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Link recensioni Google</label>
              <input
                value={p.studioGoogleReview}
                onChange={e => p.setStudioGoogleReview(e.target.value)}
                placeholder="https://g.page/r/..."
                style={inputStyle}
              />
              {p.studioGoogleReview && (
                <div style={{ marginTop: 6, fontSize: 11, color: THEME.teal, fontWeight: 600 }}>
                  ✓ Configurato — sarà usato nel messaggio di richiesta recensione
                </div>
              )}
              {!p.studioGoogleReview && (
                <div style={{ marginTop: 6, fontSize: 11, color: THEME.muted }}>
                  Copialo dalla tua pagina Google Business. Serve per chiedere recensioni ai pazienti via WhatsApp.
                </div>
              )}
            </div>

            {/* ─── Logo studio (multi-tenancy: salvato su studios.logo_base64) ─── */}
            <div style={{ gridColumn: "1 / -1", marginTop: 8, paddingTop: 16, borderTop: `1px solid ${THEME.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Logo studio
              </div>
              <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 10 }}>
                Appare nei PDF, ricevute, schede esercizi, link pubblici (portale, conferma, recensioni).
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                {p.logoBase64 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logoBase64} alt="Logo" style={{ height: 56, objectFit: "contain", borderRadius: 6, border: `1px solid ${THEME.border}`, padding: 4, background: "#fff" }} />
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
                <span style={{ fontSize: 11, color: THEME.muted }}>Max 200KB · PNG/JPG</span>
              </div>
            </div>
          </div>

          {/* Anteprima firma */}
          {(p.studioSignatureName || p.studioSignatureTitle) && (
            <div style={{
              marginTop: 20, padding: 14, borderRadius: 8,
              background: "#f8fafc", border: `1px solid ${THEME.border}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: THEME.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Anteprima firma nei messaggi
              </div>
              <div style={{ fontSize: 13, color: THEME.textSoft, lineHeight: 1.6, whiteSpace: "pre-line" }}>
                Cordiali saluti,{"\n"}
                <strong>{p.studioSignatureName || "[Nome operatore]"}</strong>{"\n"}
                {p.studioSignatureTitle || "[Qualifica]"}
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <BtnPrimary
              label={p.savingStudio ? "Salvataggio…" : "Salva dati studio"}
              onClick={p.onSave}
              disabled={p.savingStudio}
            />
          </div>
        </div>
      )}
    </div>
  );
}
