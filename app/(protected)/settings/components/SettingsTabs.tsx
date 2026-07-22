// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/settings/components/SettingsTabs.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Sidebar verticale (telaio "A") con icone a linea, che raggruppa le
// sezioni di Impostazioni in categorie:
//   • Studio        — Anagrafica/branding, sedi, orari di lavoro
//   • Team          — Operatori, stanze, ospiti, assenze
//   • Calendario    — Catalogo trattamenti, preferenze, prenotazioni, blocchi
//   • Contabilità   — Dati fiscali, Sistema TS, pagamenti, report
//   • Comunicazioni — Notifiche, template messaggi, integrazioni
//   • Account       — Password, preferenze gestionali
//
// Desktop: colonna fissa a sinistra. Mobile (≤860px): barra orizzontale
// scrollabile (classi .set-aside/.set-nav nel global style di page.tsx).
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import type React from "react";
import { THEME } from "./shared/theme";

export type SettingsTab = "studio" | "team" | "calendar" | "accounting" | "convenzioni" | "communications" | "account" | "subscription";

export type SettingsTabsProps = {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
};

const ic = (d: React.ReactNode): React.ReactNode => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
    {d}
  </svg>
);

const ICON: Record<SettingsTab, React.ReactNode> = {
  studio: ic(<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 11h.01M15 11h.01M12 11h.01" />),
  team: ic(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" /></>),
  calendar: ic(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01" /></>),
  accounting: ic(<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1ZM8 7h8M8 11h8M8 15h5" />),
  convenzioni: ic(<><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M12 10v6M9 13h6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>),
  communications: ic(<path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.38 8.38 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5Z" />),
  account: ic(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  subscription: ic(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>),
};

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "studio",          label: "Studio" },
  { id: "team",            label: "Team" },
  { id: "calendar",        label: "Agenda" },
  { id: "accounting",      label: "Contabilità" },
  { id: "convenzioni",     label: "Convenzioni" },
  { id: "communications",  label: "Comunicazioni" },
  { id: "account",         label: "Account" },
  { id: "subscription",    label: "Abbonamento" },
];

export default function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  return (
    <aside className="set-aside">
      {/* Brand: logo-mark (lo stesso della barra superiore) + wordmark */}
      <div className="set-brand" style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 10px 18px" }}>
        <svg width="26" height="26" viewBox="0 0 120 120" style={{ display: "block", flexShrink: 0 }} aria-label="FisioHub">
          <defs>
            <linearGradient id="fhGradSettings" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0d9488" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="60" fill="url(#fhGradSettings)" />
          <path d="M 15 60 L 38 60 L 46 42 L 56 78 L 66 50 L 74 60 L 105 60" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="60" cy="60" r="6" fill="#ffffff" />
          <circle cx="60" cy="60" r="3" fill="#0d9488" />
        </svg>
        <span style={{ fontWeight: 700, fontSize: 15, color: THEME.text, letterSpacing: 0.2 }}>
          Fisio<b style={{ fontWeight: 800 }}>Hub</b>
        </span>
      </div>

      <nav className="set-nav">
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "11px 12px",
                borderRadius: 9,
                border: "none",
                borderLeft: `3px solid ${active ? THEME.teal : "transparent"}`,
                background: active ? "rgba(13,148,136,0.09)" : "transparent",
                color: active ? THEME.tealDark : THEME.muted,
                cursor: "pointer",
                textAlign: "left",
                fontSize: 13.5,
                fontWeight: active ? 700 : 600,
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(30,42,43,0.04)"; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
            >
              {ICON[tab.id]}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
