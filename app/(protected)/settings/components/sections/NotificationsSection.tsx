// app/(protected)/settings/components/sections/NotificationsSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Notifiche & prenotazioni" (tab Comunicazioni).
// Spostata da StudioBranding: avvisi al professionista quando il paziente
// conferma/annulla, e toggle UI delle prenotazioni dal sito.
// Salva su tabella studios via saveStudio.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead } from "../shared/theme";
import { BtnPrimary } from "../shared/Buttons";

export type NotificationsSectionProps = {
  show: boolean;
  onToggle: () => void;
  savingStudio: boolean;
  notifyBellEnabled: boolean; setNotifyBellEnabled: (v: boolean) => void;
  notifyEmailEnabled: boolean; setNotifyEmailEnabled: (v: boolean) => void;
  notifyWaRedirectEnabled: boolean; setNotifyWaRedirectEnabled: (v: boolean) => void;
  showBookingCardHome: boolean; setShowBookingCardHome: (v: boolean) => void;
  showBookingBellCalendar: boolean; setShowBookingBellCalendar: (v: boolean) => void;
  onSave: () => void;
};

export default function NotificationsSection(p: NotificationsSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>🔔 Notifiche &amp; prenotazioni</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>Avvisi quando il paziente conferma/annulla · prenotazioni dal sito</div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "20px" }}>
          {/* ─── Notifiche pazienti ─── */}
          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Notifiche pazienti
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

          {/* ─── Prenotazioni dal sito ─── */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: THEME.text, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
              🌐 Prenotazioni dal sito
            </div>
            <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 14, lineHeight: 1.5 }}>
              Per studi con sito pubblico che riceve prenotazioni online. Disattiva queste opzioni per nascondere la UI dal gestionale (la feature continua a funzionare sul backend).
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ToggleRow
                label="Card in home"
                description="Mostra la card 'Prenotazioni dal sito' nella home (sostituisce la card notifiche)"
                checked={p.showBookingCardHome}
                onChange={p.setShowBookingCardHome}
              />
              <ToggleRow
                label="Campanella prenotazioni nel calendario"
                description="Mostra la campanella arancione delle prenotazioni nel topbar del calendario"
                checked={p.showBookingBellCalendar}
                onChange={p.setShowBookingBellCalendar}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <BtnPrimary label={p.savingStudio ? "Salvataggio…" : "Salva notifiche"} onClick={p.onSave} disabled={p.savingStudio} />
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
