// app/(protected)/settings/components/sections/PublicBookingLinkSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Link di prenotazione pubblico" (mig. 083).
//
// A differenza dei "Servizi Prenotabili Online" (che alimentano un widget
// da incollare in un sito esterno), questa è una pagina già ospitata da
// FisioHub — myfisiohub.app/prenota/{slug} — pensata per chi NON ha un
// sito proprio: si condivide il link com'è (WhatsApp, bio Instagram,
// Google Business...) e il paziente prenota da lì.
//
// Lo slug è generato automaticamente dal nome studio (trigger DB) e non è
// editabile da qui per restare semplice: se in futuro serve renderlo
// personalizzabile, si aggiunge un campo di modifica con verifica unicità.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState, useSyncExternalStore } from "react";
import { THEME, cardStyle, sectionHead } from "../shared/theme";

// L'origin è un valore che esiste solo nel browser. useSyncExternalStore
// è il modo previsto da React per leggerlo: lato server restituisce ""
// (nessun mismatch in idratazione), lato client il dominio reale — così il
// link è corretto anche su anteprime Vercel o dominio personalizzato.
const subscribeNoop = () => () => {};
const getOrigin = () => window.location.origin;
const getOriginServer = () => "";

export type PublicBookingLinkSectionProps = {
  show: boolean;
  onToggle: () => void;
  bookingSlug: string | null;
  bookingPublicEnabled: boolean;
  setBookingPublicEnabled: (v: boolean) => void;
  saving: boolean;
  onSave: () => void;
};

export default function PublicBookingLinkSection(p: PublicBookingLinkSectionProps) {
  const [copied, setCopied] = useState(false);

  const origin = useSyncExternalStore(subscribeNoop, getOrigin, getOriginServer);

  const link = p.bookingSlug && origin ? `${origin}/prenota/${p.bookingSlug}` : null;

  function copyLink() {
    if (!link) return;
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>
            Link di prenotazione pubblico
          </div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            {p.bookingPublicEnabled ? "Attivo — nessun sito richiesto" : "Non attivo"}
          </div>
        </div>
        <span style={{
          color: THEME.muted, fontSize: 12,
          transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s",
        }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "20px" }}>
          <p style={{ fontSize: 13, color: THEME.textSoft, marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
            Attiva una pagina di prenotazione già pronta, ospitata da FisioHub.
            Non serve un sito web: condividi il link su WhatsApp, nella bio
            Instagram o su Google Business e i pazienti prenotano da lì,
            scegliendo servizio, data e orario tra quelli liberi.
          </p>

          <label style={{
            display: "flex", alignItems: "center", gap: 10,
            marginBottom: 16, cursor: "pointer",
          }}>
            <input
              type="checkbox"
              checked={p.bookingPublicEnabled}
              onChange={e => p.setBookingPublicEnabled(e.target.checked)}
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: THEME.text }}>
              Rendi la pagina raggiungibile pubblicamente
            </span>
          </label>

          {link && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", borderRadius: 8,
              border: `1px solid ${THEME.border}`, background: THEME.panelSoft,
              marginBottom: 16,
            }}>
              <span style={{
                flex: 1, fontSize: 13, fontFamily: "monospace",
                color: THEME.text, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {link}
              </span>
              <button
                onClick={copyLink}
                style={{
                  padding: "6px 12px", borderRadius: 6, border: "none",
                  background: copied ? THEME.green : THEME.teal, color: "#fff",
                  fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {copied ? "Copiato ✓" : "Copia link"}
              </button>
              {p.bookingPublicEnabled && (
                <a
                  href={link} target="_blank" rel="noopener noreferrer"
                  style={{
                    padding: "6px 12px", borderRadius: 6,
                    border: `1px solid ${THEME.border}`, color: THEME.text,
                    fontWeight: 700, fontSize: 12, textDecoration: "none", whiteSpace: "nowrap",
                  }}
                >
                  Apri ↗
                </a>
              )}
            </div>
          )}

          <p style={{ fontSize: 12, color: THEME.muted, marginBottom: 16 }}>
            I servizi mostrati e gli orari disponibili sono quelli configurati
            in “Servizi Prenotabili Online” e nei tuoi orari di apertura, qui sopra.
          </p>

          <button
            onClick={p.onSave} disabled={p.saving}
            style={{
              padding: "9px 18px", borderRadius: 7, border: "none",
              background: THEME.teal, color: "#fff", fontWeight: 700,
              fontSize: 13, cursor: "pointer", opacity: p.saving ? 0.6 : 1,
            }}
          >
            {p.saving ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      )}
    </div>
  );
}
