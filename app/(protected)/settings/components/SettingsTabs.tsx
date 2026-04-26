// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/settings/components/SettingsTabs.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Tab bar che raggruppa le 12 sezioni di impostazioni in 4 categorie:
//   • Studio       — Branding, Pratica, Prezzi, Orari di lavoro
//   • Calendario   — Durate, Preferenze, Servizi prenotabili, Giorni bloccati
//   • Comunicazioni — Templates messaggi, Integrazioni (WA, Google)
//   • Account      — Password, Gestione account
//
// L'utente vede solo la categoria attiva — riduce drasticamente la
// scrollabilità della pagina e la confusione iniziale.
//
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME } from "./shared/theme";

export type SettingsTab = "studio" | "calendar" | "communications" | "account";

export type SettingsTabsProps = {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
};

const TABS: Array<{ id: SettingsTab; icon: string; label: string; description: string }> = [
  { id: "studio",          icon: "🏥", label: "Studio",          description: "Anagrafica, prezzi, orari" },
  { id: "calendar",        icon: "📅", label: "Calendario",      description: "Durate, prenotazioni, blocchi" },
  { id: "communications",  icon: "💬", label: "Comunicazioni",   description: "Messaggi e integrazioni" },
  { id: "account",         icon: "👤", label: "Account",         description: "Password e gestione" },
];

export default function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 8,
      marginBottom: 20,
    }}>
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              padding: "14px 16px",
              borderRadius: 10,
              border: `2px solid ${isActive ? THEME.blue : THEME.border}`,
              background: isActive
                ? "linear-gradient(135deg, rgba(13,148,136,0.08), rgba(37,99,235,0.08))"
                : THEME.panelBg,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s",
              boxShadow: isActive
                ? "0 4px 16px rgba(37,99,235,0.12)"
                : "0 1px 3px rgba(15,23,42,0.04)",
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.borderColor = THEME.blue;
                e.currentTarget.style.background = "rgba(37,99,235,0.04)";
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.borderColor = THEME.border;
                e.currentTarget.style.background = THEME.panelBg;
              }
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>{tab.icon}</span>
              <span style={{
                fontSize: 14,
                fontWeight: 800,
                color: isActive ? THEME.blue : THEME.text,
                letterSpacing: 0.3,
              }}>
                {tab.label}
              </span>
            </div>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: THEME.muted,
              lineHeight: 1.4,
            }}>
              {tab.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
