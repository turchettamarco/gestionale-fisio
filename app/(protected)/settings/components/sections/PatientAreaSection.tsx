// app/(protected)/settings/components/sections/PatientAreaSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Area Paziente" — cosa vede il paziente nel link personale
// che gli viene inviato (/portale/{token}).
//
// Per ora contiene una sola scelta, la visibilità degli importi nello
// storico sedute (mig. 087). Sta in una card propria e non dentro
// "Prenotazione Online" perché sono due cose diverse: quella è la pagina
// pubblica aperta a chiunque abbia il link, questa è l'area personale di
// un singolo paziente.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead } from "../shared/theme";

export type PatientAreaSectionProps = {
  show: boolean;
  onToggle: () => void;
  portalShowAmounts: boolean;
  setPortalShowAmounts: (v: boolean) => void;
  saving: boolean;
  onSave: () => void;
};

export default function PatientAreaSection(p: PatientAreaSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Area Paziente</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            {p.portalShowAmounts ? "Storico sedute con importi" : "Storico sedute senza importi"}
          </div>
        </div>
        <span style={{
          color: THEME.muted, fontSize: 12,
          transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s",
        }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "20px" }}>
          <p style={{ fontSize: 13, color: THEME.textSoft, marginTop: 0, marginBottom: 18, lineHeight: 1.5 }}>
            È il link personale che invii al paziente: da lì vede i suoi
            prossimi appuntamenti, lo storico delle sedute svolte, la scheda
            esercizi e — se hai attivato la prenotazione online — può
            richiedere un nuovo appuntamento.
          </p>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={p.portalShowAmounts}
              onChange={e => p.setPortalShowAmounts(e.target.checked)}
              style={{ width: 18, height: 18, cursor: "pointer", marginTop: 1 }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: THEME.text }}>
              Mostra gli importi nello storico sedute
              <span style={{ display: "block", fontWeight: 400, fontSize: 11.5, color: THEME.muted, marginTop: 2, lineHeight: 1.45 }}>
                Se disattivo, il paziente continua a vedere le sedute svolte con
                data e trattamento, ma senza cifre e senza il totale da saldare.
                Gli importi vengono esclusi dal server, non solo nascosti nella
                pagina.
              </span>
            </span>
          </label>

          <div style={{
            padding: "12px 14px", borderRadius: 8, background: THEME.panelSoft,
            border: `1px solid ${THEME.border}`, fontSize: 12, color: THEME.muted,
            lineHeight: 1.5, marginBottom: 16,
          }}>
            Le sedute che scalano da un pacchetto sono sempre indicate come
            “Da pacchetto” e non compaiono mai tra quelle da saldare, perché
            l&apos;incasso è registrato sul pacchetto.
          </div>

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
