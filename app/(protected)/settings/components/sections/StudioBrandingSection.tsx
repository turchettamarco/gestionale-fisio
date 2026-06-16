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
  // Iscrizione albo professionale (mig. 034) — usato negli attestati di presenza
  professionalRegisterNumber: string; setProfessionalRegisterNumber: (v: string) => void;
  professionalRegisterName: string; setProfessionalRegisterName: (v: string) => void;
  // Logo (multi-tenancy: salvato su studios.logo_base64)
  logoBase64: string; setLogoBase64: (v: string) => void;
  // Notifiche (Fase N2)
  notifyEmailEnabled: boolean; setNotifyEmailEnabled: (v: boolean) => void;
  notifyBellEnabled: boolean; setNotifyBellEnabled: (v: boolean) => void;
  notifyWaRedirectEnabled: boolean; setNotifyWaRedirectEnabled: (v: boolean) => void;
  // Report automatici via email (mig. 039)
  reportMonthlyEnabled: boolean; setReportMonthlyEnabled: (v: boolean) => void;
  reportQuarterlyEnabled: boolean; setReportQuarterlyEnabled: (v: boolean) => void;
  reportYearlyEnabled: boolean; setReportYearlyEnabled: (v: boolean) => void;
  reportEmail: string; setReportEmail: (v: string) => void;
  // Toggle UI legacy "Prenotazioni dal sito" (Fase N2.1)
  showBookingCardHome: boolean; setShowBookingCardHome: (v: boolean) => void;
  showBookingBellCalendar: boolean; setShowBookingBellCalendar: (v: boolean) => void;
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
                Iscrizione albo professionale
              </div>
              <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 10 }}>
                Usato negli attestati di presenza e nei documenti ufficiali rilasciati ai pazienti.
              </div>
            </div>

            <div>
              <label style={labelStyle}>Numero iscrizione albo</label>
              <input
                value={p.professionalRegisterNumber}
                onChange={e => p.setProfessionalRegisterNumber(e.target.value)}
                placeholder="Es. 1234"
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                Il tuo numero di iscrizione all&apos;albo
              </div>
            </div>

            <div>
              <label style={labelStyle}>Nome albo</label>
              <input
                value={p.professionalRegisterName}
                onChange={e => p.setProfessionalRegisterName(e.target.value)}
                placeholder="TSRM-PSTRP"
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                Default TSRM-PSTRP (modificabile se diverso)
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

          {/* ─── Sezione Notifiche (Fase N2) ─── */}
          <div style={{
            marginTop: 24, paddingTop: 20, borderTop: `1px solid ${THEME.border}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
              🔔 Notifiche pazienti
            </div>
            <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 14, lineHeight: 1.5 }}>
              Quando un paziente conferma o annulla un appuntamento dal link WhatsApp, scegli come venire avvisato.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ToggleRow
                label="Campanella nel calendario"
                description="Mostra le notifiche nel calendario con un badge"
                checked={p.notifyBellEnabled}
                onChange={p.setNotifyBellEnabled}
              />
              <ToggleRow
                label="Email allo studio"
                description="Invia email all'indirizzo dello studio"
                checked={p.notifyEmailEnabled}
                onChange={p.setNotifyEmailEnabled}
              />
              <ToggleRow
                label="WhatsApp di ritorno"
                description="Quando il paziente annulla, gli proponi di avvisarti su WhatsApp"
                checked={p.notifyWaRedirectEnabled}
                onChange={p.setNotifyWaRedirectEnabled}
              />
            </div>

            {/* ─── Report automatici via email ─── */}
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${THEME.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: THEME.text, marginBottom: 3 }}>
                📄 Report automatici via email
              </div>
              <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 14, lineHeight: 1.5 }}>
                Ricevi un riepilogo PDF con sedute, incassi e nuovi pazienti. Ogni cadenza è
                indipendente: attiva quelle che ti servono.
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
                  Se vuoto, i report arrivano all'indirizzo con cui accedi. Puoi indicarne un altro
                  (es. segreteria o commercialista).
                </div>
              </div>
            </div>
          </div>

          {/* ─── Sezione Prenotazioni dal sito (legacy, opzionale) ─── */}
          <div style={{
            marginTop: 24, paddingTop: 20, borderTop: `1px solid ${THEME.border}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
              🌐 Prenotazioni dal sito
            </div>
            <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 14, lineHeight: 1.5 }}>
              Funzionalità per studi con sito pubblico che riceve prenotazioni online.
              Disattiva queste opzioni per nascondere la UI dal gestionale (la feature continua a funzionare sul backend).
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ToggleRow
                label="Card in home"
                description="Mostra la card 'Prenotazioni dal sito' nella home (sostituisce la card notifiche)"
                checked={p.showBookingCardHome}
                onChange={p.setShowBookingCardHome}
              />
              <ToggleRow
                label="Campanella nel calendario"
                description="Mostra la campanella arancione delle prenotazioni nel topbar del calendario"
                checked={p.showBookingBellCalendar}
                onChange={p.setShowBookingBellCalendar}
              />
            </div>
          </div>

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
